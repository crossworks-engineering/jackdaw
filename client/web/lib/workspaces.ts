/**
 * Workspaces (plan 4887b8e7, phase W5a): the wire shapes of /api/workspaces
 * and the pure rules the screens follow, so each rule is unit-tested
 * (workspaces.test.ts) without a browser.
 *
 * W5a manages workspaces only. Nothing here changes who reads what: the
 * switcher lists workspaces and filters nothing yet (W5b).
 *
 * The types are local until @crossworks/client-types publishes them; switch
 * the imports then and delete these.
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';

/** One workspace as GET /api/workspaces lists it. */
export type Workspace = {
  id: string;
  name: string;
  description: string;
  /** A contact this workspace is for. Information only, never a permission. */
  contactNodeId: string | null;
  assistant: { id: string; name: string } | null;
  /** The one Admin workspace: its users manage the brain. */
  isAdmin: boolean;
  /** Admin users are Moderators here (plan 21.8 row 2). */
  adminModerated: boolean;
  archived: boolean;
  /** Admin and Team (contract change 20): no archive, no rename, and their
   *  connectors follow the connector bridge until W5b. Absent from a brain
   *  before brain round 3: see isBuiltIn. */
  builtIn?: boolean;
  userCount: number;
  resourceCount: number;
  /** The signed-in login's place in it. */
  me: { member: boolean; moderator: boolean };
};

export type WorkspaceUser = {
  loginId: string;
  name: string | null;
  email: string;
  moderator: boolean;
  /** A Moderator because they are an Admin user and Admin users moderate
   *  this workspace (Team): nobody demotes or removes them here (409
   *  admin_kept); they stop by leaving the Admin workspace. */
  adminViaArea: boolean;
  /** Who added them: display name, else email. null when unknown (the
   *  adder's login is gone, or a migration or bridge added them). */
  addedBy?: { loginId: string; name: string } | null;
  /** When they were added (ISO 8601). */
  addedAt?: string;
};

export type WorkspaceResource = {
  kind: string;
  id: string;
  name: string;
  write: boolean;
  /** Kept by a level bridge until W5b (the Admin and Team connectors follow
   *  each connector's level): shown, not changed here. */
  locked?: boolean;
};

/** GET /api/workspaces/:id */
export type WorkspaceDetail = {
  workspace: Workspace;
  users: WorkspaceUser[];
  resources: WorkspaceResource[];
  /** The assistant has history in this workspace: it stays here. */
  hasHistory: boolean;
};

export type ArchivePreview = { grantCount: number; itemCount: number };

export type UserSearchHit = { loginId: string; name: string | null; email: string };

/** What GET /api/shell adds for workspaces. */
export type ShellWorkspace = { id: string; name: string; isAdmin: boolean; moderator: boolean };

export const WORKSPACES_KEY = ['workspaces'] as const;
export const workspaceKey = (id: string) => ['workspaces', id] as const;

// ── Areas (plan 1.4: requireArea) ───────────────────────────────────────────

/** The Admin areas the brain names in /api/shell `areas`. */
export const AREAS = ['settings', 'users', 'assistants', 'connectors', 'keys'] as const;
export type Area = (typeof AREAS)[number];

/** Whether the login may manage this area. A brain before W5a sends no
 *  `areas`: it answers /api/shell only for an admin, who has all of them. */
export function hasArea(areas: readonly string[] | null | undefined, area: Area): boolean {
  return areas == null ? true : areas.includes(area);
}

const AREA_PATHS: ReadonlyArray<[prefix: string, area: Area]> = [
  ['/settings/users', 'users'],
  ['/settings/agents', 'assistants'],
  ['/settings/ai-workers', 'assistants'],
  ['/settings/worker-groups', 'assistants'],
  ['/settings/heartbeats', 'assistants'],
  ['/settings/skills', 'assistants'],
  ['/settings/connectors', 'connectors'],
  ['/settings/tool-groups', 'connectors'],
  ['/settings/tools', 'connectors'],
  ['/settings/mcp', 'connectors'],
  ['/settings/peers', 'connectors'],
  ['/settings/keys', 'keys'],
  ['/settings/api-access', 'keys'],
];

/**
 * The area a settings path needs, or null when it needs none. The Workspaces
 * list needs none: every login sees the workspaces it is in, and a Moderator
 * manages theirs. Any other settings screen is the `settings` area.
 */
export function areaForPath(pathname: string): Area | null {
  if (pathname !== '/settings' && !pathname.startsWith('/settings/')) return null;
  if (pathname === '/settings/workspaces' || pathname.startsWith('/settings/workspaces/')) {
    return null;
  }
  for (const [prefix, area] of AREA_PATHS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return area;
  }
  return 'settings';
}

/** Whether the login may open this path, by the areas it holds. */
export function mayOpenPath(
  areas: readonly string[] | null | undefined,
  pathname: string,
): boolean {
  const area = areaForPath(pathname);
  return area === null || hasArea(areas, area);
}

// ── Who may change what ────────────────────────────────────────────────────

/**
 * Whether the login manages this workspace: a Moderator of it, or a login
 * with the Users and workspaces area (plan R7: Admin users manage a
 * workspace's name, assistant and connectors). The brain checks again; this
 * only decides what the screen offers.
 */
export function canManageWorkspace(
  ws: Pick<Workspace, 'me' | 'archived'>,
  areas: readonly string[] | null | undefined,
): boolean {
  if (ws.archived) return false;
  return ws.me.moderator || hasArea(areas, 'users');
}

/** Admin and Team: the brain's `builtIn`, else (a brain before contract
 *  change 20) the two marks only they carry. */
export function isBuiltIn(ws: Pick<Workspace, 'builtIn' | 'isAdmin' | 'adminModerated'>): boolean {
  return ws.builtIn ?? (ws.isAdmin || ws.adminModerated);
}

/** What the name field says on a built-in workspace (change 19: 409
 *  reserved_name on a rename). */
export const BUILT_IN_NAME_HINT = 'Built-in workspaces keep their names.';

/** Whether the screen offers Archive: a managed workspace that is not built
 *  in (the brain refuses Admin and Team). */
export function canArchiveWorkspace(
  ws: Pick<Workspace, 'me' | 'archived' | 'isAdmin' | 'adminModerated' | 'builtIn'>,
  areas: readonly string[] | null | undefined,
): boolean {
  return !isBuiltIn(ws) && canManageWorkspace(ws, areas);
}

/** The contact is set by an Admin user (the brain refuses anyone else),
 *  read here as the Users and workspaces area. */
export function canSetContact(areas: readonly string[] | null | undefined): boolean {
  return hasArea(areas, 'users');
}

/** Remove on a user row: never the viewer's own row in Admin (leaving Admin
 *  is the change to a member login; the brain refuses it, 403 self_demote). */
export function canRemoveUser(
  ws: Pick<Workspace, 'isAdmin'>,
  user: Pick<WorkspaceUser, 'email'>,
  viewerEmail: string | null | undefined,
): boolean {
  if (!ws.isAdmin || !viewerEmail) return true;
  return user.email.trim().toLowerCase() !== viewerEmail.trim().toLowerCase();
}

/** The assistant is picked with the Assistants area. */
export function canPickAssistant(areas: readonly string[] | null | undefined): boolean {
  return hasArea(areas, 'assistants');
}

/** An Admin user kept as a Moderator of Team is not demoted or removed
 *  there by anybody (contract change 14: 409 admin_kept). */
export function canChangeUser(user: Pick<WorkspaceUser, 'adminViaArea'>): boolean {
  return !user.adminViaArea;
}

/** "Added by NAME on DATE" (plan S1: every add shows on the screen), or
 *  null when the brain sends no date. */
export function addedText(user: Pick<WorkspaceUser, 'addedBy' | 'addedAt'>): string | null {
  if (!user.addedAt || Number.isNaN(new Date(user.addedAt).getTime())) return null;
  const on = formatDate(user.addedAt);
  return user.addedBy?.name ? `Added by ${user.addedBy.name} on ${on}` : `Added on ${on}`;
}

// ── Words ──────────────────────────────────────────────────────────────────

/** The one sentence the screen shows for an admin-moderated workspace
 *  (plan 21.8 row 2: no magic, it is said on the screen). */
export const ADMIN_MODERATED_TEXT = 'Admin users moderate this workspace.';

/** The assistant has history here (plan 21.8 row 14). */
export const HAS_HISTORY_TEXT = 'Has history: clone to use elsewhere.';

/** The switcher's note while it filters nothing (W5a). */
export const SWITCHER_NOTE = 'Lists show the items of the workspace you pick.';

export const ALL_WORKSPACES_LABEL = 'All my workspaces';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A list card's second line: the users, and the assistant when there is
 *  one. (resourceCount counts the assistant too, so it is not "connectors".) */
export function workspaceMeta(ws: Pick<Workspace, 'userCount' | 'assistant'>): string {
  const users = plural(ws.userCount, 'user');
  return ws.assistant ? `${users} · ${ws.assistant.name}` : users;
}

/** Archive is refused while items have their home here (move them first). */
export function archiveBlocked(preview: ArchivePreview): boolean {
  return preview.itemCount > 0;
}

/** What the archive confirm says, with the counts the brain gave. */
export function archiveConfirmText(name: string, preview: ArchivePreview): string {
  if (archiveBlocked(preview)) {
    const items = plural(preview.itemCount, 'item');
    return `${items} ${preview.itemCount === 1 ? 'has its' : 'have their'} home in ${name}. Move ${preview.itemCount === 1 ? 'it' : 'them'} to another workspace first.`;
  }
  if (preview.grantCount === 0) {
    return `No items are shared with ${name}. Its users lose this workspace.`;
  }
  const shared = plural(preview.grantCount, 'item');
  return `${shared} shared with ${name} ${preview.grantCount === 1 ? 'loses' : 'lose'} that share. Users who read an item only through ${name} cannot read it after this.`;
}

/** The brain's own words for a failed call (`{ error, code }`), else a plain
 *  fallback. Shown as is. */
export function workspaceErrorText(err: unknown, fallback = 'Could not save.'): string {
  if (err instanceof ApiError && err.message) return err.message;
  return fallback;
}

/** The brain's error code, when it sent one. */
export function workspaceErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const code = err.body?.code;
  return typeof code === 'string' ? code : null;
}

/** The name to show for a user: the display name, else the email. */
export function userLabel(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email;
}

// ── Lists ──────────────────────────────────────────────────────────────────

/** Admin first, then by name; archived last. */
export function sortWorkspaces<T extends Pick<Workspace, 'name' | 'isAdmin' | 'archived'>>(
  list: readonly T[],
): T[] {
  return [...list].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** User search runs from this many characters for a Moderator (the brain's
 *  minimum). An Admin user may search with nothing typed: the full list. */
export const USER_SEARCH_MIN = 3;

export function userSearchMin(areas: readonly string[] | null | undefined): number {
  return userSearchPaged(areas) ? 0 : USER_SEARCH_MIN;
}

/** The full user list, in pages: the Users and workspaces area. */
export function userSearchPaged(areas: readonly string[] | null | undefined): boolean {
  return hasArea(areas, 'users');
}

/** How long user search waits after the last key. */
export const USER_SEARCH_DEBOUNCE_MS = 250;

export function userSearchReady(q: string, min = USER_SEARCH_MIN): boolean {
  return q.trim().length >= min;
}

/** An Admin user's search answers pages of this many. */
export const USER_SEARCH_PAGE = 50;

/** The offset of the next page, or undefined when there is none. Only an
 *  Admin user pages (a Moderator gets one answer of at most 10); a full page
 *  may have more behind it. */
export function nextUserSearchOffset(
  pages: readonly (readonly unknown[])[],
  paged: boolean,
): number | undefined {
  if (!paged) return undefined;
  const last = pages[pages.length - 1];
  return last && last.length >= USER_SEARCH_PAGE ? pages.length * USER_SEARCH_PAGE : undefined;
}

/** Search hits that are not in the workspace yet. */
export function addableHits(
  hits: readonly UserSearchHit[],
  users: readonly Pick<WorkspaceUser, 'loginId'>[],
): UserSearchHit[] {
  const inIt = new Set(users.map((u) => u.loginId));
  return hits.filter((h) => !inIt.has(h.loginId));
}

/** The workspaces a login is in, by name, from the details the screen has. */
export function workspacesOfLogin(
  details: readonly (WorkspaceDetail | undefined)[],
  loginId: string,
): Pick<Workspace, 'id' | 'name'>[] {
  const found = details.filter(
    (d): d is WorkspaceDetail =>
      !!d && !d.workspace.archived && d.users.some((u) => u.loginId === loginId),
  );
  return sortWorkspaces(found.map((d) => d.workspace)).map(({ id, name }) => ({ id, name }));
}

export const workspaceHref = (id: string) =>
  `/settings/workspaces?selected=${encodeURIComponent(id)}`;

// ── Resources (plan 1.4: one section per descriptor) ───────────────────────

/**
 * The resource types a workspace can hold. A new type is one more entry here
 * and one more value the brain accepts: no new screen. W5a has connectors;
 * the assistant is its own section (at most one).
 */
export type ResourceKind = {
  kind: string;
  /** The section heading. */
  label: string;
  /** One of them, in a sentence. */
  noun: string;
  /** What the Write tick means for this type. */
  writeHint: string;
};

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  {
    kind: 'connector',
    label: 'Connectors',
    noun: 'connector',
    writeHint:
      'Write on: Moderators can use the tools that change data. Off, or for other users: read tools only.',
  },
];

/** A row's controls: none for a locked (bridge-kept) row. */
export function resourceEditable(r: Pick<WorkspaceResource, 'locked'>): boolean {
  return !r.locked;
}

/** What a locked row says instead of its controls. */
export const RESOURCE_LOCKED_TEXT = 'Set by the connector level for now.';

/** The connectors not on the workspace yet, by slug. */
export function addableResources<T extends { slug: string }>(
  all: readonly T[],
  resources: readonly WorkspaceResource[],
  kind: string,
): T[] {
  const held = new Set(resources.filter((r) => r.kind === kind).map((r) => r.id));
  return all.filter((c) => !held.has(c.slug));
}

// ── The switcher's choice (a per-login preference) ─────────────────────────

/** The switcher's value for "All my workspaces". */
export const ALL_WORKSPACES = 'all';

/** The choice to show: the stored one while it is still one of the login's
 *  workspaces, else All. */
export function resolveCurrentWorkspace(
  stored: string | null | undefined,
  workspaces: readonly Pick<ShellWorkspace, 'id'>[],
): string {
  if (stored && workspaces.some((w) => w.id === stored)) return stored;
  return ALL_WORKSPACES;
}

/** What the switcher's button says. */
export function currentWorkspaceLabel(
  current: string,
  workspaces: readonly Pick<ShellWorkspace, 'id' | 'name'>[],
): string {
  return workspaces.find((w) => w.id === current)?.name ?? ALL_WORKSPACES_LABEL;
}

/** The shell's workspaces, as far as this client can read them: [] for a
 *  brain that sends none or something it does not know. */
export function shellWorkspacesOf(
  shell: { workspaces?: unknown } | null | undefined,
): ShellWorkspace[] {
  const raw = shell?.workspaces;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (w): w is ShellWorkspace =>
      !!w && typeof w === 'object' && typeof w.id === 'string' && typeof w.name === 'string',
  );
}

/** The shell's areas; undefined for a brain that sends none (all on). */
export function shellAreasOf(shell: { areas?: unknown } | null | undefined): string[] | undefined {
  const raw = shell?.areas;
  return Array.isArray(raw) ? raw.filter((a): a is string => typeof a === 'string') : undefined;
}

/** The nav without the screens the login may not manage (plan 7.1: screens
 *  hide by area). A group left empty goes too, and a hidden href leaves a
 *  collapsible group's cold-start head. */
export function navWithAreas<
  G extends { items: { href: string }[]; defaultHead?: readonly string[] },
>(groups: readonly G[], areas: readonly string[] | null | undefined): G[] {
  if (areas == null) return [...groups];
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => mayOpenPath(areas, i.href)),
      ...(g.defaultHead ? { defaultHead: g.defaultHead.filter((h) => mayOpenPath(areas, h)) } : {}),
    }))
    .filter((g) => g.items.length > 0);
}

// ── Admin workspace membership (W5a contract change 4) ─────────────────────

/** Until W5b a user of the Admin workspace IS an admin login: adding one is
 *  the role change to admin. Said where users are added to Admin. */
export const ADMIN_ADD_TEXT =
  'A user added here is an Admin user: they manage the brain and every workspace.';

/** What the remove confirm says. Leaving Admin is the change back to a
 *  member login, and it ends that login's sessions. */
export function removeUserText(ws: Pick<Workspace, 'name' | 'isAdmin'>, name: string): string {
  if (ws.isAdmin) {
    return `${name} stops being an Admin user and cannot manage the brain. Their sessions end, so they sign in again.`;
  }
  return `${name} stops reading the items shared with ${ws.name}, unless another of their workspaces has them.`;
}

/** Connectors on a workspace are set with the Connectors area (the brain
 *  answers 403 admin_only to anyone else). */
export function canSetConnectors(areas: readonly string[] | null | undefined): boolean {
  return hasArea(areas, 'connectors');
}
