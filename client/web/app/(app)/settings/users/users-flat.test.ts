/**
 * The Users screen is flat (workspaces W5a, plan 7.1 and 21.9; W5c): account
 * actions only (disable, reset password, devices, sign out everywhere, phone
 * pairing, delete), no role or other permission control, the login's
 * workspaces as links, each login's Chat, invites, and the sender of
 * sign-in codes. No Clients section and nothing about clients (W5c).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginWorkspacesView } from './login-workspaces';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const src = read('./users-client.tsx');
/** The screen and the files only it renders. */
const screen = [src, read('./invites.tsx'), read('./email-code-sender.tsx')].join('\n');

describe('Users screen source', () => {
  it('has no role control', () => {
    expect(src).not.toContain('RoleFields');
    expect(src).not.toContain('Save role');
    expect(src).not.toMatch(/PATCH',\s*\{\s*role/);
    expect(src).not.toContain('<SelectItem value="admin"');
  });

  it('a new login is made with the least, never the brain default (admin)', () => {
    expect(src).toContain("export const NEW_LOGIN_ROLE = 'member';");
    expect(src).toContain('role: NEW_LOGIN_ROLE,');
  });

  it('keeps the account actions', () => {
    expect(src).toContain('aria-label="Disable this login"');
    expect(src).toContain('Reset password');
    expect(src).toContain('<DevicesCard user={user} isSelf={isSelf} />');
    expect(src).toContain('<PairPhoneCard userId={user.id} />');
  });

  it('shows the login workspaces', () => {
    expect(src).toContain('<LoginWorkspaces loginId={user.id} />');
  });

  it('no role badge on a login', () => {
    expect(src).not.toMatch(/user\.role === 'member' && /);
    expect(src).not.toMatch(/user\.role === 'client'/);
  });

  it('keeps sign out everywhere and delete', () => {
    expect(src).toContain('<SignOutEverywhereButton user={user} isSelf={isSelf} />');
    expect(src).toContain('label="Delete login"');
  });

  it('has no Clients section, no What clients see and no Client settings (W5c)', () => {
    for (const gone of [
      'title="Clients"',
      'Add client',
      'What clients see',
      'Client settings',
      '/api/access/client-report',
      'ClientReport',
      'ClientStorage',
      'ClientChatUsage',
      'components/team-admin',
    ]) {
      expect(screen, gone).not.toContain(gone);
    }
    // The only Team admin client route left is the sender setting.
    const clientRoutes = screen.match(/\/api\/team-admin\/clients[^'"`\s]*/g) ?? [];
    expect(clientRoutes.every((r) => r.startsWith('/api/team-admin/clients/signin-sender'))).toBe(
      true,
    );
  });

  it("keeps each login's Chat and the Sign-in by email code entry", () => {
    expect(src).toContain('<LoginChat loginId={user.id} name={name} />');
    expect(src).toContain("export const EMAIL_CODE_TITLE = 'Sign-in by email code';");
    expect(src).toContain('<EmailCodeSenderPanel />');
  });

  it('keeps invites: the dialog, the open invites and the invite pane', () => {
    expect(src).toContain('<InviteDialog');
    expect(src).toContain('title="Open invites"');
    expect(src).toContain('<InviteDetail');
  });
});

describe('LoginWorkspacesView', () => {
  it('links each workspace to its screen', () => {
    const html = renderToStaticMarkup(
      createElement(LoginWorkspacesView, {
        workspaces: [
          { id: 'w-admin', name: 'Admin' },
          { id: 'w-team', name: 'Team' },
        ],
        loading: false,
      }),
    );
    expect(html).toContain('href="/settings/workspaces?selected=w-admin">Admin</a>');
    expect(html).toContain('href="/settings/workspaces?selected=w-team">Team</a>');
  });

  it('says None for a login in no workspace', () => {
    const html = renderToStaticMarkup(
      createElement(LoginWorkspacesView, { workspaces: [], loading: false }),
    );
    expect(html).toContain('None');
  });
});
