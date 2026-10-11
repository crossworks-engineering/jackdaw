import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GONE_ROUTE, GONE_ROUTE_NEEDLES } from './gone-routes';

/**
 * Nothing calls a route a W6b or W7 brain answers 410. The routes and their
 * needles are THE list in lib/gone-routes.ts, which the e2e specs read too
 * (e2e/workspace/shell-nav.ts GONE_ROUTE).
 *
 * Every source file of the app, the UI kit, the desktop shell and the e2e
 * specs is scanned for a quoted path (or a quoted route base that such a path
 * was built on). Paths are the repo's.
 */
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ROOTS = ['client/web/', 'packages/web-ui/src/', 'client/desktop/src/', 'e2e/'];
/** The guard itself and the list it reads name every gone route. */
const SELF = ['client/web/lib/no-gone-route.guard.test.ts', 'client/web/lib/gone-routes.ts'];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(relative(REPO, path).split(sep).join('/'));
  }
  return out;
}

const scanned = ROOTS.flatMap((r) => sources(join(REPO, r))).filter((f) => !SELF.includes(f));

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

  it.each(GONE_ROUTE_NEEDLES)('no file names %s', (_name, needle) => {
    const hits = scanned.filter((f) => needle.test(readFileSync(join(REPO, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the needles catch what they are for', () => {
    const caught = (src: string) => GONE_ROUTE_NEEDLES.some(([, re]) => re.test(src));
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
    // Template strings built on another base (W7f).
    expect(caught('`${origin}/api/mcp-logins`')).toBe(true);
    expect(caught('`${origin}/api/mcp-logins/${id}/tokens`')).toBe(true);
    expect(caught('`${base}/api/access/agents/${slug}`')).toBe(true);
    expect(caught('`${base}/api/access/tool-groups${q}`')).toBe(true);
    expect(caught('`${base}/api/team-admin/member-chats?login=${id}`')).toBe(true);
    expect(caught("'/api/access/agents' + '/' + slug")).toBe(true);
    // Prose in a comment is not a call; a live sibling route is not gone.
    expect(caught(' * PATCH /api/access/tool-groups/:slug answers 410')).toBe(false);
    expect(caught('`${base}/api/team-admin/members`')).toBe(false);
    expect(caught("apiFetch('/api/access/agentsx')")).toBe(false);
  });

  it('the e2e specs read the same list', () => {
    expect(GONE_ROUTE.test('/api/mcp-logins')).toBe(true);
    expect(GONE_ROUTE.test('/api/mcp-logins/x/tokens')).toBe(true);
    expect(GONE_ROUTE.test('/api/access/tool-groups/core')).toBe(true);
    expect(GONE_ROUTE.test('/api/team-admin/member-chats')).toBe(true);
    expect(GONE_ROUTE.test('/api/member/space-files/x')).toBe(true);
    expect(GONE_ROUTE.test('/api/member/chat/unread')).toBe(true);
    expect(GONE_ROUTE.test('/api/member/mcp')).toBe(false);
    expect(GONE_ROUTE.test('/api/member/chats')).toBe(false);
    expect(GONE_ROUTE.test('/api/team-admin/members')).toBe(false);
    const shellNav = readFileSync(join(REPO, 'e2e/workspace/shell-nav.ts'), 'utf8');
    expect(shellNav).toContain("from '../../client/web/lib/gone-routes'");
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
