import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoleSwitch, ShellRoleGate, ViewerRoleProvider, useViewerRole } from './viewer-role';

/**
 * The role plumbing renders (client logins C0): three roles and a neutral
 * "not known yet", with no default of admin anywhere. The owner screen (the
 * ADMIN marker below) renders for a confirmed admin and nothing else.
 */
const ADMIN = createElement('p', null, 'ADMIN-SCREEN');
const MEMBER = createElement('p', null, 'MEMBER-SCREEN');

const withRole = (role: unknown, child: ReactNode) =>
  renderToStaticMarkup(
    // `unknown`: a role this build does not know must render as nobody.
    createElement(ViewerRoleProvider, { role: role as 'admin', children: child }),
  );

const switchFor = (role: unknown) =>
  withRole(role, createElement(RoleSwitch, { member: MEMBER, children: ADMIN }));

const gateFor = (role: unknown, probeFailed = false) =>
  renderToStaticMarkup(
    createElement(ShellRoleGate, {
      role: role as 'admin',
      probeFailed,
      onRetry: () => {},
      children: (r: 'admin' | 'member') => (r === 'admin' ? ADMIN : MEMBER),
    }),
  );

function RoleProbe() {
  return createElement('p', null, `role:${String(useViewerRole())}`);
}

describe('ViewerRoleProvider', () => {
  it('has no default role: outside a provider it is null, never admin', () => {
    expect(renderToStaticMarkup(createElement(RoleProbe))).toContain('role:null');
  });

  it('hands down each role, and null while it is not known', () => {
    for (const r of ['admin', 'member', 'client', null]) {
      expect(withRole(r, createElement(RoleProbe))).toContain(`role:${String(r)}`);
    }
  });
});

describe('RoleSwitch', () => {
  it('renders the owner screen for an admin', () => {
    const html = switchFor('admin');
    expect(html).toContain('ADMIN-SCREEN');
    expect(html).not.toContain('MEMBER-SCREEN');
  });

  it('renders the member screen for a member', () => {
    const html = switchFor('member');
    expect(html).toContain('MEMBER-SCREEN');
    expect(html).not.toContain('ADMIN-SCREEN');
  });

  it('renders the neutral client screen for a client login, with Sign out', () => {
    const html = switchFor('client');
    expect(html).toContain('This account is a client login.');
    expect(html).toContain('The client portal is not available yet.');
    expect(html).toContain('Sign out');
    expect(html).not.toContain('ADMIN-SCREEN');
    expect(html).not.toContain('MEMBER-SCREEN');
  });

  it('renders the neutral loading screen while the role is not known', () => {
    const html = switchFor(null);
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading');
    expect(html).not.toContain('ADMIN-SCREEN');
    expect(html).not.toContain('MEMBER-SCREEN');
  });

  it('renders the neutral screen for a role it does not know', () => {
    for (const r of ['owner', 'guest', '']) {
      const html = switchFor(r);
      expect(html, r).toContain('This account cannot open this workspace here.');
      expect(html, r).toContain('Sign out');
      expect(html, r).not.toContain('ADMIN-SCREEN');
      expect(html, r).not.toContain('MEMBER-SCREEN');
    }
  });

  it('renders the loading screen outside any provider, never the owner screen', () => {
    const html = renderToStaticMarkup(
      createElement(RoleSwitch, { member: MEMBER, children: ADMIN }),
    );
    expect(html).toContain('Loading');
    expect(html).not.toContain('ADMIN-SCREEN');
  });
});

describe('ShellRoleGate (the whole shell)', () => {
  it('renders the shell for a confirmed admin or member, with that role', () => {
    expect(gateFor('admin')).toContain('ADMIN-SCREEN');
    expect(gateFor('member')).toContain('MEMBER-SCREEN');
  });

  it('renders a full-window neutral screen for everything else', () => {
    for (const [role, text] of [
      [null, 'Loading'],
      ['client', 'This account is a client login.'],
      ['guest', 'This account cannot open this workspace here.'],
    ] as const) {
      const html = gateFor(role);
      expect(html, String(role)).toContain(text);
      expect(html, String(role)).toContain('min-h-dvh');
      expect(html, String(role)).not.toContain('ADMIN-SCREEN');
      expect(html, String(role)).not.toContain('MEMBER-SCREEN');
    }
  });

  it('offers Try again (and Sign out) when the probe failed, not the shell', () => {
    const html = gateFor(null, true);
    expect(html).toContain('Could not reach the workspace');
    expect(html).toContain('Try again');
    expect(html).toContain('Sign out');
    expect(html).not.toContain('ADMIN-SCREEN');
  });

  it('a failed probe never overrides a role the brain gave', () => {
    expect(gateFor('client', true)).toContain('This account is a client login.');
    expect(gateFor('admin', true)).toContain('ADMIN-SCREEN');
  });
});
