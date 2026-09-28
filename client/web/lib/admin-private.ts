/**
 * An admin's own private items (member logins Phase 7): where the Private
 * view lives, and how an owner create flow's "Keep private" switch routes a
 * new item into it instead of the brain. The view is the kind's own screen
 * with `?space=private` (and `&id=` for the open item); the brain view is the
 * screen as it always was.
 */
import { MEMBER_KIND } from './member-kinds';
import {
  adminSpace,
  memberUploadRefusal,
  type AdminSpaceClient,
  type SpaceKind,
} from './member-space';

/** The switch's one line of help, the same in every create flow. */
export const KEEP_PRIVATE_HELP = 'Only you can see it until you accept it into the brain.';

export const SPACE_PARAM = 'space';
export const PRIVATE_SPACE = 'private';

export type CreatableKind = Exclude<SpaceKind, 'file'>;

/** Is this URL the Private view? */
export function isPrivateView(params: Pick<URLSearchParams, 'get'> | null | undefined): boolean {
  return params?.get(SPACE_PARAM) === PRIVATE_SPACE;
}

/** The Private view of a kind's screen, with an item open when `id` is set. */
export function privateViewHref(kind: SpaceKind, id?: string | null): string {
  const sp = new URLSearchParams({ [SPACE_PARAM]: PRIVATE_SPACE });
  if (id) sp.set('id', id);
  return `${MEMBER_KIND[kind].path}?${sp.toString()}`;
}

/** The brain view of a kind's screen (the owner list, as it always was). */
export function brainViewHref(kind: SpaceKind): string {
  return MEMBER_KIND[kind].path;
}

/** Where an item accepted into the brain opens: its own brain route. A file
 *  opens in the folder the accept put it in. */
export function acceptedBrainHref(kind: SpaceKind, id: string, folderPath?: string | null): string {
  if (kind === 'file') {
    const sp = new URLSearchParams();
    if (folderPath) sp.set('path', folderPath);
    sp.set('file', id);
    return `/files?${sp.toString()}`;
  }
  return `${MEMBER_KIND[kind].path}/${id}`;
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
