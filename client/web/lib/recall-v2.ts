/**
 * Recall v2: the pure half of the native map editor. Everything here is
 * logic the screen would otherwise get subtly wrong inline, so it lives
 * where a test can hold it.
 *
 * The brain's rules this encodes (mantle docs/recall.md, v2 section):
 * - Every write carries the map `version` it was made against; a stale one
 *   is refused with 409 `version_stale`, never merged.
 * - A card PUT REPLACES the card. Leave `prompt` out on a prompt card and it
 *   is demoted to knowledge; leave `options` out and they are wiped. So a
 *   write is always built from the whole card, never from the edited fields.
 * - The entry card (`start`) is always first and cannot be deleted.
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import type {
  RecallCardDetailDTO,
  RecallCardWriteDTO,
  RecallMapSummaryDTO,
  RecallNodeDTO,
  RecallOptionDTO,
  RecallRevisionDTO,
  RecallWriteErrorDTO,
} from '@mantle/web-ui/types/recall-v2';

/** The entry card's slug on every native map. */
export const RECALL_ENTRY_SLUG = 'start';

/** Query keys. The catalog and a map's detail share v1's keys on purpose:
 *  the routes are the same, and a write must refresh both screens' caches. */
export const recallKeys = {
  maps: ['recall', 'maps'] as const,
  map: (mapId: string) => ['recall', 'maps', mapId] as const,
  card: (mapId: string, slug: string) => ['recall', 'maps', mapId, 'card', slug] as const,
  revisions: (mapId: string) => ['recall', 'maps', mapId, 'revisions'] as const,
};

/** `features.recallV2` from the shell: true or false once the shell has
 *  answered, undefined before. An older brain sends no `features` object,
 *  which reads as false: it keeps the v1 screen. */
export function recallV2Of(shell: unknown): boolean | undefined {
  if (shell === undefined || shell === null) return undefined;
  const features = (shell as { features?: { recallV2?: unknown } }).features;
  return features?.recallV2 === true;
}

/** A map the page editor authors (v1): its cards are pages, and nothing in
 *  the v2 editor may write it. */
export function isPageBuilt(map: Pick<RecallMapSummaryDTO, 'nodeId'>): boolean {
  return map.nodeId === null || map.nodeId === undefined;
}

/** The fields the card editor owns. Everything else on the card is carried
 *  through from what the brain last sent. */
export type CardEdits = {
  title: string;
  bodyMd: string;
  useWhen: string;
  /** The Prompt switch. */
  prompt: boolean;
  options: RecallOptionDTO[];
};

export function editsOf(card: RecallCardDetailDTO): CardEdits {
  return {
    title: card.title,
    bodyMd: card.bodyMd,
    useWhen: card.useWhen,
    prompt: card.kind === 'prompt',
    options: card.options.map(cleanOption),
  };
}

/** An option as the write takes it. `targetId` is the brain's to fill (it is
 *  stripped on the way in anyway), and a same-map option has no `targetMap`. */
export function cleanOption(o: RecallOptionDTO): RecallOptionDTO {
  const out: RecallOptionDTO = { label: o.label, useWhen: o.useWhen, targetSlug: o.targetSlug };
  if (o.targetMap) out.targetMap = o.targetMap;
  return out;
}

/** The whole-card body for PUT (replace) or POST (create). */
export function cardWriteBody(
  edits: CardEdits,
  version: number,
  after?: string,
): RecallCardWriteDTO {
  const body: RecallCardWriteDTO = {
    title: edits.title.trim(),
    bodyMd: edits.bodyMd,
    useWhen: edits.useWhen.trim(),
    prompt: edits.prompt,
    options: edits.options.map(cleanOption),
    version,
  };
  if (after) body.after = after;
  return body;
}

export function sameEdits(a: CardEdits, b: CardEdits): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

function normalise(e: CardEdits) {
  return { ...e, options: e.options.map(cleanOption) };
}

/** What the editor can tell before it sends: the brain would refuse these,
 *  and saying so next to the field beats a round trip. Keyed by field. */
export function cardProblems(
  edits: CardEdits,
  budget: number,
): Partial<Record<'title' | 'bodyMd' | 'useWhen' | 'options', string>> {
  const out: Partial<Record<'title' | 'bodyMd' | 'useWhen' | 'options', string>> = {};
  if (!edits.title.trim()) out.title = 'A card needs a title.';
  if (edits.bodyMd.length > budget) {
    out.bodyMd = `${edits.bodyMd.length - budget} characters over the ${budget} budget. Split it: add a second card and give this one an option to it.`;
  }
  if (edits.prompt && !edits.useWhen.trim()) {
    out.useWhen = 'A prompt needs a use-when line: it is what the prompt is matched on.';
  }
  const blank = edits.options.findIndex((o) => !o.label.trim() || !o.targetSlug.trim());
  if (blank >= 0) out.options = `Option ${blank + 1} needs a label and a target.`;
  return out;
}

/** Body counter state: `near` from 90% of the budget, `over` past it. */
export function budgetState(chars: number, budget: number): 'ok' | 'near' | 'over' {
  if (chars > budget) return 'over';
  if (chars >= budget * 0.9) return 'near';
  return 'ok';
}

/** The slug order after moving one card up or down. The entry card never
 *  moves and nothing moves above it. Returns null when the move is a no-op.
 *  Always the FULL list: the reorder route leaves unlisted cards at their old
 *  rank, which can collide with the new ones. */
export function moveCard(
  nodes: Pick<RecallNodeDTO, 'slug'>[],
  slug: string,
  dir: -1 | 1,
): string[] | null {
  const slugs = nodes.map((n) => n.slug);
  const i = slugs.indexOf(slug);
  const j = i + dir;
  if (i < 0 || slug === RECALL_ENTRY_SLUG) return null;
  if (j < 0 || j >= slugs.length || slugs[j] === RECALL_ENTRY_SLUG) return null;
  const out = [...slugs];
  out[i] = slugs[j]!;
  out[j] = slugs[i]!;
  return out;
}

/** The slug order after dragging `active` onto `over`'s place (dnd-kit's
 *  arrayMove semantics). Same rules as moveCard: the entry card never moves
 *  and nothing lands above it, and the result is always the FULL order.
 *  Null when the drop changes nothing or breaks a rule. */
export function dropCard(
  nodes: Pick<RecallNodeDTO, 'slug'>[],
  active: string,
  over: string,
): string[] | null {
  const slugs = nodes.map((n) => n.slug);
  const from = slugs.indexOf(active);
  let to = slugs.indexOf(over);
  if (from < 0 || to < 0 || from === to || active === RECALL_ENTRY_SLUG) return null;
  if (slugs[0] === RECALL_ENTRY_SLUG && to === 0) to = 1;
  if (from === to) return null;
  const out = [...slugs];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved!);
  return out;
}

/** A card's options with one more appended, for "add a card from here". */
export function withOption(edits: CardEdits, option: RecallOptionDTO): CardEdits {
  return { ...edits, options: [...edits.options, cleanOption(option)] };
}

/** The error body the brain sends on a refused write, when it sent one. */
export function writeErrorOf(err: unknown): RecallWriteErrorDTO | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as Partial<RecallWriteErrorDTO> | undefined;
  if (body && typeof body.error === 'string') return { error: body.error, code: body.code };
  return { error: err.message };
}

export function isStale(err: unknown): boolean {
  return writeErrorOf(err)?.code === 'version_stale';
}

/** The one line to show for a failed write. The brain's refusals are written
 *  to be read as they are, so they pass through; a stale version gets the
 *  editor's own wording, because the editor is what re-reads. */
export function writeErrorText(err: unknown, fallback: string): string {
  if (isStale(err)) {
    return 'This map changed since you opened it (another tab or an agent). It has been reloaded; check it and save again.';
  }
  const e = writeErrorOf(err);
  if (e?.error) return e.error;
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Revisions whose restore the brain cannot do faithfully today, so the
 *  editor does not offer it. Keyed by the revision's summary, the only thing
 *  that says what kind of write it was.
 *
 * - `prompt confirmed` / `prompt request dropped`: the revision's `before`
 *   holds only the prompt flags, and restore writes it as a whole card, so
 *   the card comes back with its slug as its title and an empty body.
 * - `map created` / `cards reordered`: restore changes nothing but still
 *   bumps the version and logs a "no change" revision. */
const UNRESTORABLE: Record<string, string> = {
  'prompt confirmed':
    'Restoring a prompt confirmation would blank the card. Use the Prompt switch instead.',
  'prompt request dropped': 'Restoring this would blank the card. Use the Prompt switch instead.',
  'map created': 'There is nothing before a map was created.',
  'cards reordered': 'Order is not restored. Move the cards instead.',
};

export function restoreBlockedReason(rev: Pick<RecallRevisionDTO, 'summary'>): string | null {
  return UNRESTORABLE[rev.summary] ?? null;
}

/** Restore never re-sends the prompt flag, so restoring a card that is a
 *  prompt NOW demotes it to knowledge. Say so before the owner confirms. */
export function restoreCaveat(
  rev: Pick<RecallRevisionDTO, 'cardId'>,
  nodes: Pick<RecallNodeDTO, 'id' | 'kind'>[],
): string | null {
  if (!rev.cardId) return null;
  const card = nodes.find((n) => n.id === rev.cardId);
  return card?.kind === 'prompt'
    ? 'This card is a prompt now. Restoring puts back its text but makes it an ordinary card; switch Prompt back on afterwards.'
    : null;
}

/** Where an option can lead: every other card in this map, and the entry of
 *  every other PUBLISHED native map (the brain refuses an unpublished one). */
export type OptionTarget = { value: string; label: string; targetSlug: string; targetMap?: string };

export function optionTargets(
  map: { slug: string; nodes: Pick<RecallNodeDTO, 'slug' | 'title'>[] },
  selfSlug: string | null,
  maps: RecallMapSummaryDTO[],
): OptionTarget[] {
  const inMap = map.nodes
    .filter((n) => n.slug !== selfSlug)
    .map((n) => ({ value: `card:${n.slug}`, label: n.title, targetSlug: n.slug }));
  const other = maps
    .filter((m) => m.slug !== map.slug && m.published && !isPageBuilt(m))
    .map((m) => ({
      value: `map:${m.slug}`,
      label: `${m.title} (another map)`,
      targetSlug: m.slug,
      targetMap: m.slug,
    }));
  return [...inMap, ...other];
}

export function optionTargetValue(o: Pick<RecallOptionDTO, 'targetSlug' | 'targetMap'>): string {
  return o.targetMap ? `map:${o.targetMap}` : `card:${o.targetSlug}`;
}
