/**
 * The Users screen is flat (workspaces W5a, plan 7.1 and 21.9; W5c): account
 * actions only (disable, reset password, devices, sign out everywhere, phone
 * pairing, delete), no role or other permission control, the login's
 * workspaces as links and invites. No Clients section and nothing about
 * clients (W5c). No Chat view: each user reads only their own chats (W7c).
 * No sign-in by email code and no sender for it (W8).
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
const screen = [src, read('./invites.tsx')].join('\n');

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
    // No Team admin client route at all: the sender setting went in W8.
    expect(screen).not.toMatch(/\/api\/team-admin\/clients/);
  });

  it("has no Chat view of another login's chats (W7c)", () => {
    for (const gone of ['LoginChat', 'member-chats', 'MEMBER_CHATS_PATH', 'view=chat']) {
      expect(screen, gone).not.toContain(gone);
    }
  });

  it('has no Sign-in by email code entry and no sender setting (W8)', () => {
    for (const gone of ['EMAIL_CODE', 'EmailCodeSender', 'email code', 'signin-sender']) {
      expect(screen, gone).not.toContain(gone);
    }
  });

  it('shows the former client refusals in plain words (W8)', () => {
    // Enabling one (409 former-client), and a new login on the email of one
    // (409 email-was-client: the email field says it).
    expect(src).toContain("toast.error(loginRefusalText(err, 'Could not change the login'));");
    expect(src).toContain("if (refusalReason(err) === 'email-was-client') {");
    expect(src).toContain("setErrors({ email: loginRefusalText(err, 'Could not add user') });");
    expect(read('./invites.tsx')).toContain(
      "const EMAIL_REASONS = new Set(['email-has-login', 'no-email', 'email-was-client']);",
    );
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
