import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nothing calls a route a W6b or W7 brain answers 410.
 *
 * W6b (contract item 1): the personal spaces are folded into the brain, and
 * every login uses the owner routes in its own scope. The member space, its
 * files, the member's own apps and trash, the member items list and the
 * member tree are gone, and so are the admin's private space and its files.
 *
 * W7b: the per-login MCP switches (/api/mcp-logins) and the agent and tool
 * group levels (PATCH /api/access/agents/:slug and
 * /api/access/tool-groups/:slug) are gone: one MCP surface, no levels.
 *
 * W7c: every login chats on /api/assistant in its own threads, so the member
 * chat (/api/member/chat, its read and unread) and the Admin member chats
 * (/api/team-admin/member-chats) are gone.
 *
 * Every source file of the app, the UI kit, the desktop shell and the e2e
 * specs is scanned for a quoted path (or a quoted route base that such a path
 * was built on). Paths are the repo's.
 */
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ROOTS = ['client/web/', 'packages/web-ui/src/', 'client/desktop/src/', 'e2e/'];
const SELF = 'client/web/lib/no-gone-route.guard.test.ts';

/** The 410 routes of the W6b, W7b and W7c contracts, as a quoted path starts. */
export const GONE_ROUTES: [string, RegExp][] = [
  ['/api/member/space (and its items, drafts, saves and bytes)', /['"`]\/api\/member\/space\b/],
  ['/api/member/space-files', /['"`]\/api\/member\/space-files\b/],
  ['/api/member/my-apps (and its trash, history and share)', /['"`]\/api\/member\/my-apps\b/],
  ['/api/member/items', /['"`]\/api\/member\/items\b/],
  ['/api/member/tree (and its search, move and folders)', /['"`]\/api\/member\/tree\b/],
  ['/api/admin/space (and its items, drafts, saves and bytes)', /['"`]\/api\/admin\/space\b/],
  ['/api/admin/space-files', /['"`]\/api\/admin\/space-files\b/],
  // A route base the paths above were built on ('/api/member' + '/space').
  ['a bare /api/member or /api/admin base', /['"`]\/api\/(member|admin)\/?['"`]/],
  // W7b.
  ['/api/mcp-logins (and its tokens)', /['"`]\/api\/mcp-logins\b/],
  ['/api/access/agents/:slug (an agent level)', /['"`]\/api\/access\/agents\b/],
  ['/api/access/tool-groups/:slug (a tool group level)', /['"`]\/api\/access\/tool-groups\b/],
  // W7c.
  ['/api/member/chat (and its read and unread)', /['"`]\/api\/member\/chat\b/],
  ['/api/team-admin/member-chats', /['"`]\/api\/team-admin\/member-chats\b/],
];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(relative(REPO, path).split(sep).join('/'));
  }
  return out;
}

const scanned = ROOTS.flatMap((r) => sources(join(REPO, r))).filter((f) => f !== SELF);

describe('no call to a route a W6b or W7 brain answers 410', () => {
  it('scans the app, the UI kit, the desktop shell and the e2e specs', () => {
    for (const f of [
      'client/web/components/item-tree/tree-api.ts',
      'client/web/lib/member-apps.ts',
      'client/web/components/member/member-home.tsx',
      'client/web/app/(app)/pages/pages-client.tsx',
      'client/web/app/(app)/apps/apps-client.tsx',
      'packages/web-ui/src/api-fetch.ts',
      'e2e/workspace/member-shell.spec.ts',
      // W7: the MCP screen, the tool group screens, Users, Peers and the chat.
      'client/web/app/(app)/settings/(hub)/mcp/mcp-client.tsx',
      'client/web/app/(app)/settings/tool-groups/tool-groups-client.tsx',
      'client/web/app/(app)/settings/users/users-client.tsx',
      'client/web/app/(app)/settings/peers/peer-access.tsx',
      'client/web/app/(app)/assistant/assistant-client.tsx',
      'client/web/components/assistant/assistant-dock.tsx',
    ]) {
      expect(scanned).toContain(f);
    }
  });

  it.each(GONE_ROUTES)('no file names %s', (_name, needle) => {
    const hits = scanned.filter((f) => needle.test(readFileSync(join(REPO, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the needles catch what they are for', () => {
    const caught = (src: string) => GONE_ROUTES.some(([, re]) => re.test(src));
    expect(caught("apiFetch('/api/member/space?page=1')")).toBe(true);
    expect(caught('`/api/member/tree/${kind}/search`')).toBe(true);
    expect(caught("'/api/admin/space/' + id")).toBe(true);
    expect(caught("const BASE = '/api/member';")).toBe(true);
    expect(caught("apiFetch('/api/member/apps')")).toBe(false);
    expect(caught("apiFetch('/api/member/home')")).toBe(false);
    expect(caught('`/api/member/files/${id}`')).toBe(false);
    // W7b and W7c.
    expect(caught("apiFetch('/api/mcp-logins')")).toBe(true);
    expect(caught('`/api/mcp-logins/${id}/tokens`')).toBe(true);
    expect(caught('`/api/access/tool-groups/${slug}`')).toBe(true);
    expect(caught('`/api/access/agents/${slug}`')).toBe(true);
    expect(caught("apiFetch('/api/member/chat')")).toBe(true);
    expect(caught("'/api/member/chat/unread'")).toBe(true);
    expect(caught("const P = '/api/team-admin/member-chats';")).toBe(true);
    expect(caught("apiFetch('/api/member/mcp')")).toBe(false);
    expect(caught("apiFetch('/api/assistant/conversations')")).toBe(false);
    expect(caught("apiFetch('/api/mcp-settings')")).toBe(false);
  });

  it('the W7 screens that called them are gone', () => {
    for (const gone of [
      'client/web/components/member/member-chat.tsx',
      'client/web/components/member/member-chat-thread.tsx',
      'client/web/components/member/member-chat-button.tsx',
      'client/web/components/member/thread-chat.tsx',
      'client/web/lib/member-chat.ts',
      'client/web/components/logins/login-chat.tsx',
      'client/web/lib/login-chat.ts',
      'client/web/app/(app)/settings/(hub)/mcp/mcp-logins.tsx',
      'client/web/app/(app)/settings/(hub)/mcp/member-mcp-client.tsx',
      'client/web/app/(app)/settings/tool-groups/group-level-section.tsx',
      'client/web/lib/tool-group-level.ts',
    ]) {
      expect(existsSync(join(REPO, gone)), gone).toBe(false);
    }
  });
});
