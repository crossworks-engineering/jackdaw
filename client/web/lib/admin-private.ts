/**
 * An admin's own private items (member logins Phase 7): where they show, and
 * how an owner create flow's "Keep private" switch routes a new item into
 * them instead of the brain. Since the item-list alignment they list INSIDE
 * the kind's own screen, beside the brain's items, wearing a `private` pill;
 * the screen's State filter (`?state=private`) lists them alone, and
 * `?pid=<id>` opens one. The old Private view (`?space=private&id=`) still
 * resolves: the screens redirect it (legacyPrivateHref).
 */
import { MEMBER_KIND } from './member-kinds';
import {
  adminSpace,
  memberUploadRefusal,
  refusalReason,
  type AdminSpaceClient,
  type AdminSpaceItemRow,
  type SpaceKind,
} from './member-space';

/** The switch's one line of help, the same in every create flow. */
export const KEEP_PRIVATE_HELP = 'Only you can see it until you accept it into the brain.';

export const SPACE_PARAM = 'space';
export const PRIVATE_SPACE = 'private';
/** The open private item on a kind's screen. */
export const PRIVATE_ID_PARAM = 'pid';

export type CreatableKind = Exclude<SpaceKind, 'file'>;

/** Is this URL the retired Private view (`?space=private`)? */
export function isPrivateView(params: Pick<URLSearchParams, 'get'> | null | undefined): boolean {
  return params?.get(SPACE_PARAM) === PRIVATE_SPACE;
}

/** The kind's screen with a private item open (`id`), or filtered to the
 *  private items (no `id`). */
export function privateViewHref(kind: SpaceKind, id?: string | null): string {
  const sp = new URLSearchParams(id ? { [PRIVATE_ID_PARAM]: id } : { state: PRIVATE_SPACE });
  return `${MEMBER_KIND[kind].path}?${sp.toString()}`;
}

/** Where an old Private-view link (`?space=private[&id=]`) goes now. */
export function legacyPrivateHref(kind: SpaceKind, params: Pick<URLSearchParams, 'get'>): string {
  return privateViewHref(kind, params.get('id'));
}

/** The kind's screen, unfiltered. */
export function brainViewHref(kind: SpaceKind): string {
  return MEMBER_KIND[kind].path;
}

/**
 * "Keep private" in a create flow: make the item in the admin's private
 * space (never the brain route) and answer the Private view that opens it.
 * A note's text goes in the same create call (the route takes it for a
 * note): with a second write, a refused text (too long, an embed) left an
 * empty private note behind, and Create again made a second one.
 */
export async function createPrivateItem(
  kind: CreatableKind,
  input: { title: string; content?: string },
  client: Pick<AdminSpaceClient, 'create'> = adminSpace,
): Promise<string> {
  const { item } = await client.create({
    type: kind,
    title: input.title.trim(),
    ...(kind === 'note' && input.content ? { content: input.content } : {}),
  });
  return privateViewHref(kind, item.id);
}

/**
 * "Keep private" for a file: upload it into the admin's private space and
 * answer the Private view that opens it. The space's per-file cap is checked
 * before a byte is sent (the brain refuses above it too).
 */
export async function uploadPrivateFile(
  file: File,
  client: Pick<AdminSpaceClient, 'upload'> = adminSpace,
): Promise<string> {
  const tooLarge = memberUploadRefusal(file.size);
  if (tooLarge) throw new Error(tooLarge);
  const { row } = await client.upload(file);
  return privateViewHref('file', row.id);
}

const TEXT_MIME: Record<'md' | 'txt' | 'json', string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
};

/** A new text file for "Keep private" in the Files New file dialog: the
 *  private space takes files by upload, so the starter body goes as one. */
export function privateTextFile(filename: string, ext: 'md' | 'txt' | 'json', body: string): File {
  return new File([body], filename, { type: TEXT_MIME[ext] });
}

// ── Items taken over from the Review queue (audit F07) ──────────────────

/** Who the admin took this item from, or null for their own item. */
export function takenFromOf(row: Pick<AdminSpaceItemRow, 'takenFrom'>) {
  return row.takenFrom ?? null;
}

/**
 * May the admin delete this private item? Their own, always. A taken item
 * only once its member cannot take it back (deactivated or removed): while
 * they can, the brain refuses (409 `taken`), so the action is not offered.
 */
export function canDeletePrivate(row: Pick<AdminSpaceItemRow, 'takenFrom'>): boolean {
  return !row.takenFrom || !row.takenFrom.canGiveBack;
}

/** The sentence for a refused delete of a private item. */
export function privateDeleteMessage(err: unknown): string | null {
  if (refusalReason(err) === 'taken') {
    return 'Its member can still take this back, so it cannot be deleted yet.';
  }
  return null;
}
