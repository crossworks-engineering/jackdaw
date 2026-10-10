/**
 * The Users screen is flat (workspaces W5a, plan 7.1 and 21.9): account
 * actions only (disable, reset password, devices, phone pairing), no role or
 * other permission control, and the login's workspaces as links.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginWorkspacesView } from './login-workspaces';

const src = readFileSync(fileURLToPath(new URL('./users-client.tsx', import.meta.url)), 'utf8');

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
