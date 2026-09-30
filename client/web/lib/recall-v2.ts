/**
 * Recall v2: the pure half of the native map editor. Everything here is
 * logic the screen would otherwise get subtly wrong inline, so it lives
 * where a test can hold it.
 *
 * The brain's rules this encodes (mantle docs/recall.md, v2 section):
 * - Every write carries the map `version` it was made against; a stale one
 *   is refused with 409 `version_stale`, never merged.
 * - A card PUT is FIELD-STICKY. `title` and `bodyMd` are required and
 *   replace. `useWhen`, `options` and `prompt` keep their current value when
 *   left out. From the owner, `prompt: true` makes the card a prompt (and
 *   confirms an agent's pending request) and `prompt: false` makes it
 *   knowledge (demoting a prompt, or dropping a pending request). So the
 *   editor sends `prompt` only when the owner moved the switch.
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
 *  the routes are the same, and a write must refresh both screens' caches.
 *  Everything sits under `maps`, so invalidating it refreshes the lot. */
export const recallKeys = {
  maps: ['recall', 'maps'] as const,
  /** Every page of the catalog at once (option targets, page-built maps). */
  allMaps: ['recall', 'maps', { all: true }] as const,
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

/** An option with its text fields trimmed, as the write sends it. */
function trimOption(o: RecallOptionDTO): RecallOptionDTO {
  const out = cleanOption(o);
  out.label = out.label.trim();
  out.useWhen = out.useWhen.trim();
  return out;
}

/** The form as a save sends it: trimmed where the brain trims. After a save
 *  the form is set to this, so trailing spaces do not leave it dirty. */
export function normalisedEdits(e: CardEdits): CardEdits {
  return {
    title: e.title.trim(),
    bodyMd: e.bodyMd,
    useWhen: e.useWhen.trim(),
    prompt: e.prompt,
    options: e.options.map(trimOption),
  };
}

/**
 * The PUT body for saving the editor. `base` is the card as the edit started
 * from it. `prompt` is sent only when the owner moved the switch in this
 * edit: left out, the brain keeps the card's prompt state, which is what
 * keeps an agent's pending request alive through an unrelated save.
 */
export function cardWriteBody(
  edits: CardEdits,
  base: Pick<CardEdits, 'prompt'>,
  version: number,
): RecallCardWriteDTO {
  const e = normalisedEdits(edits);
  const body: RecallCardWriteDTO = {
    title: e.title,
    bodyMd: e.bodyMd,
    useWhen: e.useWhen,
    options: e.options,
    version,
  };
  if (e.prompt !== base.prompt) body.prompt = e.prompt;
  return body;
}

/** The PUT that adds one option to a card ("add a card from here"): the
 *  title and body it must send, and the options. Nothing else, so the
 *  card's use-when, its prompt state and any pending request stay as the
 *  brain has them. */
export function linkFromBody(
  card: Pick<RecallCardDetailDTO, 'title' | 'bodyMd' | 'options'>,
  option: RecallOptionDTO,
  version: number,
): RecallCardWriteDTO {
  return {
    title: card.title,
    bodyMd: card.bodyMd,
    options: [...card.options.map(cleanOption), cleanOption(option)],
    version,
  };
}

export function sameEdits(a: CardEdits, b: CardEdits): boolean {
  return JSON.stringify(normalisedEdits(a)) === JSON.stringify(normalisedEdits(b));
}

/**
 * Where the map's version stands against the one an edit started from.
 * `chain` maps each version the owner's own writes were sent at to the one
 * they got back, so a run of the owner's own writes (publish, reorder, a new
 * card) is told apart from someone else's.
 * - `same`: nothing was written since.
 * - `own`: only the owner's own writes, from this tab.
 * - `foreign`: something else wrote the map (an agent, another tab).
 * - `behind`: the cached map is older than the edit (a late refetch); wait.
 */
export function versionState(
  from: number,
  current: number,
  chain: Readonly<Record<number, number>>,
): 'same' | 'own' | 'foreign' | 'behind' {
  if (current === from) return 'same';
  if (current < from) return 'behind';
  let v = from;
  for (let i = 0; i < 1000; i++) {
    const next = chain[v];
    if (next === undefined || next <= v) break;
    v = next;
    if (v === current) return 'own';
  }
  return 'foreign';
}

/**
 * The brain's size caps on everything but the body (mantle recall-native.ts,
 * brain v0.232.358 and later). Not in the published contract, so mirrored
 * here; an older brain has no caps and these only hold the editor back.
 */
export const RECALL_TITLE_MAX = 200;
export const RECALL_LINE_MAX = 500;
export const RECALL_LABEL_MAX = 200;
export const RECALL_OPTIONS_MAX = 30;

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
  const blank = edits.options.findIndex(
    (o) => !o.label.trim() || !o.useWhen.trim() || !o.targetSlug.trim(),
  );
  if (blank >= 0) {
    out.options = `Option ${blank + 1} needs a label, a use-when line and a target.`;
  } else if (edits.options.length > RECALL_OPTIONS_MAX) {
    out.options = `A card can have at most ${RECALL_OPTIONS_MAX} options. Group the rest behind a card of their own.`;
  }
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

/** Revisions with nothing before them to put back, so the editor does not
 *  offer a restore. Keyed by the revision's summary, the only thing that
 *  says what kind of write it was. An old "cards reordered" row (logged
 *  before the brain kept the old order) is refused by the brain with a
 *  sentence of its own, which the editor shows as it comes. */
const UNRESTORABLE: Record<string, string> = {
  'map created': 'There is nothing before a map was created. To remove the map, delete it.',
};

export function restoreBlockedReason(rev: Pick<RecallRevisionDTO, 'summary'>): string | null {
  return UNRESTORABLE[rev.summary] ?? null;
}

/** What restoring this revision will do, in the confirm dialog. Keyed by
 *  the summary, like the guard above; an unknown one gets the general line. */
export function restoreCopy(rev: Pick<RecallRevisionDTO, 'summary' | 'cardSlug'>): string {
  const card = rev.cardSlug ? `the card ${rev.cardSlug}` : 'the card';
  switch (rev.summary) {
    case 'card added':
      return `Deletes ${card} again. Options on other cards that lead to it are removed with it.`;
    case 'card edited':
      return `Puts ${card} back as it was before that edit: title, body, use-when, options and prompt state. Anything written to it since is replaced.`;
    case 'card deleted':
      return `Brings ${card} back with its text, its old link name and its old place, and puts back the options other cards had to it. A card deleted before the brain kept those comes back at the end, without them.`;
    case 'prompt confirmed':
    case 'prompt request dropped':
    case 'prompt state restored':
      return `Puts back only whether ${card} is a prompt, as it was before that write. Its text is not touched.`;
    case 'cards reordered':
      return 'Puts the cards back in the order they had before that move. Cards added since stay, after them.';
    case 'published':
      return 'Unpublishes the map again. No agent can see it until it is published.';
    case 'unpublished':
      return 'Publishes the map again, so agents can find it.';
  }
  if (!rev.cardSlug) {
    return 'Puts back the map settings that write changed (title, enter-when, slug, published), as they were before it.';
  }
  return 'Puts back what that write replaced.';
}

/** Who made a revision, as the log shows it. */
export function actorLabel(rev: Pick<RecallRevisionDTO, 'actorKind' | 'actorName'>): string {
  if (rev.actorKind === 'agent') {
    if (rev.actorName === 'mcp') return 'An MCP client';
    return rev.actorName ? `Agent ${rev.actorName}` : 'An agent';
  }
  return rev.actorName ?? 'Owner';
}

/** The line for options a write removed along with the card they led to
 *  (a card delete, or restoring a "card added" revision). */
export function droppedText(dropped: readonly { cardSlug: string; label: string }[]): string {
  if (dropped.length === 0) return '';
  const parts = dropped.map((d) => `"${d.label}" on ${d.cardSlug}`);
  return `Removed ${dropped.length === 1 ? 'the option' : 'the options'} to it: ${parts.join(', ')}.`;
}

/** One page of the catalog, as `GET /api/recall/maps` sends it. */
export type RecallMapsPage = {
  maps: RecallMapSummaryDTO[];
  total?: number;
  page?: number;
  pageSize?: number;
};

/** Every map in the catalog, page by page. The catalog pages at 20, and
 *  option targets and the page-built list need all of them. Stops at
 *  `maxPages` so a brain that misreports its total cannot loop forever. */
export async function fetchAllMaps(
  fetchPage: (page: number) => Promise<RecallMapsPage>,
  maxPages = 50,
): Promise<RecallMapSummaryDTO[]> {
  const first = await fetchPage(1);
  const out = [...first.maps];
  const total = first.total ?? out.length;
  const size = first.pageSize ?? Math.max(1, first.maps.length);
  const pages = Math.min(maxPages, Math.ceil(total / size));
  for (let p = 2; p <= pages; p++) {
    const next = await fetchPage(p);
    if (next.maps.length === 0) break;
    out.push(...next.maps);
  }
  return out;
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
