/**
 * Grants (plan 4887b8e7, phase W5b): the wire shapes of /api/grants and the
 * pure rules the Grant Access panel, the workspace chips, the folder confirm
 * and the move dialog follow, so each rule is unit-tested (grants.test.ts)
 * without a browser.
 *
 * An item is shared by a grant to a workspace. Each grant has its own Write
 * switch. A folder passes its grants to what is in it ("via folder X"); a
 * child can change that row by hand. There is no level any more.
 *
 * The types are local until @crossworks/client-types publishes them
 * (mantle packages/client-types/src/dto/grants.ts); switch the imports then
 * and delete these.
 */
import type { AccessContactShare } from '@mantle/client-types';
import { ApiError } from '@mantle/web-ui/api-fetch';

/** A workspace as a list row or a chip names it. */
export type WorkspaceRef = { id: string; name: string };

/** One row of the panel: one workspace the item is granted to. */
export type GrantRow = {
  wsId: string;
  name: string;
  /** Users there may change the item (an app: its data). */
  write: boolean;
  /** The item's home: where it lives. It has no remove (move it instead). */
  isHome: boolean;
  /** The folder this row comes from, null when it is set on the item. Its
   *  title is null when the caller cannot open that folder. */
  viaFolder: { id: string; title: string | null } | null;
  /** A folder row removed here by hand ("Removed here", with Restore). */
  excluded: boolean;
  /** Kept by the level bridge until grants become the truth (W5b part B):
   *  no change here (409 bridge_owned). */
  bridgeOwned?: boolean;
};

/** GET /api/grants/:nodeId. */
export type GrantsView = {
  /** `name` is null when the caller is not a user of the home workspace. */
  home: { wsId: string; name: string | null };
  rows: GrantRow[];
  /** Workspaces the login moderates that the item is not granted to yet. */
  addable: { wsId: string; name: string }[];
  /** May the login change the grants. Else the panel only reads. */
  mayManage: boolean;
  /** A page, drawing or note: what it embeds that is not granted where it is. */
  embedsNotGranted: { nodeId: string; title: string; kind: string }[];
  /** An app: MCP access to its data (moved here from the app's settings). */
  app?: { mcpAccess: boolean };
  /** The item, its open link and its contact shares (contract change 1).
   *  `link` is filled only when `mayLink`; `hasLink` tells everyone a live
   *  open link exists. Absent from an older brain: no link part. */
  item?: { id: string; title: string; type: string };
  link?: { id: string; path: string } | null;
  hasLink?: boolean;
  mayLink?: boolean;
  contactShares?: AccessContactShare[] | null;
};

/** What a grant write answers: the panel again, or `{ visible: false }`
 *  when the caller no longer reads the item after its own change. */
export type GrantsWriteResponse =
  | (GrantsView & { skipped?: { nodeId: string; wsId: string; code: string }[] })
  | { visible: false };

export const lostSight = (r: unknown): r is { visible: false } =>
  !!r && typeof r === 'object' && (r as { visible?: unknown }).visible === false;

export const LOST_SIGHT_TEXT = 'Done. You can no longer see this item.';

/** The embeds write: how many pairs the caller may not grant. */
export function skippedText(n: number): string | null {
  if (n <= 0) return null;
  return `${n === 1 ? 'One embed was' : `${n} embeds were`} not shared: you may not share ${n === 1 ? 'it' : 'them'} there.`;
}

/** GET /api/grants/:id/preview: how many items gain or lose. */
export type FolderGrantPreview = {
  gain: number;
  lose: number;
  /** Too many items to change in one go. */
  tooBig: boolean;
  total?: number;
  /** An app with add: what the new holder sees. `rows` is null when the
   *  app has no database or it cannot be read. */
  app?: { rows: number | null; exportedTables: number };
};

/** POST /api/grants/move/preview. */
export type MovePreview = {
  alsoVisibleTo: { wsId: string; name: string }[];
  removedFrom: { wsId: string; name: string }[];
};

export type MoveTo = { toFolderId: string | null } | { toWorkspaceId: string };

// ── URLs ────────────────────────────────────────────────────────────────

const enc = encodeURIComponent;
export const grantsUrl = (nodeId: string) => `/api/grants/${enc(nodeId)}`;
export const grantUrl = (nodeId: string, wsId: string) => `/api/grants/${enc(nodeId)}/${enc(wsId)}`;
export const grantsKey = (nodeId: string) => ['grants', nodeId] as const;

/** The folder preview of one change: adding or removing one workspace. */
export function folderPreviewUrl(folderId: string, change: GrantChange): string {
  const sp = new URLSearchParams();
  if (change.add) sp.set('add', change.add);
  if (change.remove) sp.set('remove', change.remove);
  return `${grantsUrl(folderId)}/preview?${sp.toString()}`;
}

/** One change to a folder's grants, for its preview and its confirm. */
export type GrantChange = { add?: string; remove?: string; name: string };

/** Add `?confirm=1` to a URL (DELETE, restore and hand carry no body). */
export const withConfirm = (url: string, confirm: boolean) =>
  confirm ? `${url}${url.includes('?') ? '&' : '?'}confirm=1` : url;

// ── The panel's rows ────────────────────────────────────────────────────

/** Home first, then by name; rows removed here last. */
export function sortRows(rows: readonly GrantRow[]): GrantRow[] {
  return [...rows].sort((a, b) => {
    if (a.isHome !== b.isHome) return a.isHome ? -1 : 1;
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** The quiet line under a row's name. */
export function rowNote(row: GrantRow): string | null {
  const folder = row.viaFolder ? (row.viaFolder.title ?? 'a folder you cannot open') : null;
  if (row.excluded && folder) return `Removed here (folder ${folder} grants it)`;
  if (row.excluded) return 'Removed here';
  if (row.isHome) return 'Home: the item lives here';
  if (folder) return `Via folder ${folder}`;
  return null;
}

/** A row the level bridge keeps (contract change 7): shown, never changed. */
export const BRIDGE_OWNED_TEXT = 'Follows the item’s level until grants become the truth';

/** What a row offers a Moderator. The home has no remove (21.8: a move
 *  takes it away); a folder row is changed here first ("Change here")
 *  before its Write switch moves; a removed row only comes back. */
export function rowActions(row: GrantRow): {
  write: boolean;
  remove: boolean;
  restore: boolean;
  changeHere: boolean;
  move: boolean;
} {
  if (row.bridgeOwned) {
    return { write: false, remove: false, restore: false, changeHere: false, move: false };
  }
  if (row.excluded) {
    return { write: false, remove: false, restore: true, changeHere: false, move: false };
  }
  const folder = row.viaFolder !== null && !row.isHome;
  return {
    write: !folder,
    remove: !row.isHome,
    restore: false,
    changeHere: folder,
    move: row.isHome,
  };
}

/** "Add workspace" choices: the Admin workspace first for an Admin user
 *  (21.8: "Add Admin" is the first choice), then by name. */
export function sortAddable<T extends { wsId: string; name: string }>(
  addable: readonly T[],
  adminWsId: string | null,
): T[] {
  return [...addable].sort((a, b) => {
    const aa = a.wsId === adminWsId;
    const bb = b.wsId === adminWsId;
    if (aa !== bb) return aa ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The read-only panel's line for a row's switch. */
export const writeWord = (write: boolean) => (write ? 'Can change' : 'Read only');

/** The Write switch's label. On an app it is the data (the old
 *  "Informational" flag, now per workspace). */
export function writeLabel(type: string | undefined, name: string): string {
  return type === 'app' ? `Users in ${name} can change its data` : `Users in ${name} can change it`;
}

export const READ_ONLY_PANEL_TEXT =
  'You can see who has this item. Only a Moderator can change it.';
export const NO_ADDABLE_TEXT = 'You moderate no other workspace.';
export const APP_MCP_LABEL = 'MCP access: users reach its data from their own MCP client';
export const APP_MCP_HINT =
  'Read only for a workspace with Write off. Who reaches it is who can run the app.';

/** The embeds line, with "Grant these too". */
export function embedsLine(n: number): string {
  return `${n === 1 ? 'One item it embeds is' : `${n} items it embeds are`} not shared with the same workspaces. People there do not see ${n === 1 ? 'it' : 'them'}.`;
}

// ── Chips ───────────────────────────────────────────────────────────────

/** The workspaces a list row carries (absent from a brain before W5b). */
export function workspacesOf(row: unknown): WorkspaceRef[] {
  const raw = (row as { workspaces?: unknown } | null)?.workspaces;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (w): w is WorkspaceRef =>
      !!w && typeof w === 'object' && typeof w.id === 'string' && typeof w.name === 'string',
  );
}

/** At most `max` chips, then "+N". The title names them all. */
export function chipsOf(
  workspaces: readonly WorkspaceRef[],
  max = 3,
): { shown: WorkspaceRef[]; more: number; title: string } {
  const sorted = [...workspaces].sort((a, b) => a.name.localeCompare(b.name));
  return {
    shown: sorted.slice(0, max),
    more: Math.max(0, sorted.length - max),
    title: sorted.length ? `Shared with: ${sorted.map((w) => w.name).join(', ')}` : '',
  };
}

// ── Folder confirm ──────────────────────────────────────────────────────

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** The folder confirm (plan 7.1, S5): how many items gain or lose. */
export function folderConfirmText(change: GrantChange, preview: FolderGrantPreview): string {
  const parts: string[] = [];
  const verb = (n: number, v: string) => (n === 1 ? `${v}s` : v);
  if (preview.gain > 0)
    parts.push(`${plural(preview.gain, 'item')} ${verb(preview.gain, 'gain')} ${change.name}.`);
  if (preview.lose > 0)
    parts.push(`${plural(preview.lose, 'item')} ${verb(preview.lose, 'lose')} ${change.name}.`);
  if (parts.length === 0) parts.push('No item in it changes.');
  return parts.join(' ');
}

export const FOLDER_CONFIRM_NOTE =
  'Items in a folder take its workspaces. Items changed by hand keep their own.';
export const TOO_BIG_TEXT = 'This folder holds too many items. Share the sub-folders one by one.';

/** The app holder-add confirm (21.8 row 13): both effects, always. */
export function appHolderLines(
  name: string,
  holders: readonly string[],
  counts?: { rows: number | null; exportedTables: number },
): string[] {
  const what = counts
    ? [
        counts.rows !== null ? plural(counts.rows, 'row') : null,
        plural(counts.exportedTables, 'exported table'),
      ].filter(Boolean)
    : [];
  const data = what.length
    ? `This app's data (${what.join(', ')}) becomes visible to ${name}.`
    : `This app's data becomes visible to ${name}.`;
  const all = [...holders, name];
  const reads =
    all.length > 1
      ? `This app will then read only items that ${joinAnd(all)} all hold.`
      : `This app will then read only items that ${name} holds.`;
  return [data, reads];
}

function joinAnd(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ── Move ────────────────────────────────────────────────────────────────

/** "This will also be visible to: ..." (21.8 row 1), or null. */
export function alsoVisibleLine(p: Pick<MovePreview, 'alsoVisibleTo'>): string | null {
  if (!p.alsoVisibleTo.length) return null;
  return `This will also be visible to: ${p.alsoVisibleTo.map((w) => w.name).join(', ')}.`;
}

/** "It will no longer be readable in: ..." (21.8 row 9), or null. */
export function removedLine(p: Pick<MovePreview, 'removedFrom'>): string | null {
  if (!p.removedFrom.length) return null;
  return `It will no longer be readable in: ${p.removedFrom.map((w) => w.name).join(', ')}.`;
}

/** A move that changes nothing about who sees it needs no confirm. */
export const moveChangesAccess = (p: MovePreview) =>
  p.alsoVisibleTo.length > 0 || p.removedFrom.length > 0;

export const keepReadableLabel = (name: string) => `Keep it readable in ${name}`;

// ── Errors ──────────────────────────────────────────────────────────────

/** The brain's own words (`{ error, code }`), shown as is. */
export function grantErrorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  return fallback;
}

export function grantErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const code = err.body?.code;
  return typeof code === 'string' ? code : null;
}

/** A 409 too_big from a folder write. */
export const isTooBig = (err: unknown) => grantErrorCode(err) === 'too_big';

/** A brain before W5b has no /api/grants. */
export const isNoGrants = (err: unknown) => err instanceof ApiError && err.status === 404;

// ── The switcher filter ─────────────────────────────────────────────────

/** Add `ws` to a list URL when a workspace is picked (null = all). */
export function withWs(url: string, ws: string | null | undefined): string {
  if (!ws) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ws=${enc(ws)}`;
}
