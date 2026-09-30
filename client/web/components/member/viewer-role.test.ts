import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoleSwitch, ShellRoleGate, ViewerRoleProvider, useViewerRole } from './viewer-role';
import { LOADING_SIGN_OUT_AFTER_MS, RoleLoadingScreen, neutralSignOutPath } from './role-screens';

/**
 * The role plumbing renders (client logins C0): three roles and a neutral
 * "not known yet", with no default of admin anywhere. The owner screen (the
 * ADMIN marker below) renders for a confirmed admin and nothing else.
 */
const ADMIN = createElement('p', null, 'ADMIN-SCREEN');
const MEMBER = createElement('p', null, 'MEMBER-SCREEN');
const CLIENT = createElement('p', null, 'CLIENT-PORTAL');

const withRole = (role: unknown, child: ReactNode) =>
  renderToStaticMarkup(
    // `unknown`: a role this build does not know must render as nobody.
    createElement(ViewerRoleProvider, { role: role as 'admin', children: child }),
  );

const switchFor = (role: unknown) =>
  withRole(role, createElement(RoleSwitch, { member: MEMBER, children: ADMIN }));

const gateFor = (
  role: unknown,
  probeFailed = false,
  failure?: 'offline' | 'unreachable' | 'error',
) =>
  renderToStaticMarkup(
    createElement(ShellRoleGate, {
      role: role as 'admin',
      probeFailed,
      failure,
      onRetry: () => {},
      client: CLIENT,
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

  it('the loading screen holds Sign out back a few seconds, then offers it', () => {
    // First paint: no Sign out (a normal load is quick).
    expect(switchFor(null)).not.toContain('Sign out');
    expect(LOADING_SIGN_OUT_AFTER_MS).toBeGreaterThan(0);
    expect(LOADING_SIGN_OUT_AFTER_MS).toBeLessThanOrEqual(5_000);
    // Once the wait is over (0: from the start) it is there.
    const late = renderToStaticMarkup(createElement(RoleLoadingScreen, { signOutAfterMs: 0 }));
    expect(late).toContain('Sign out');
    expect(late).toContain('Loading');
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
    expect(gateFor('admin')).not.toContain('CLIENT-PORTAL');
    expect(gateFor('member')).not.toContain('CLIENT-PORTAL');
  });

  it('renders the client portal for a client login, and never the owner or member shell', () => {
    const html = gateFor('client');
    expect(html).toBe('<p>CLIENT-PORTAL</p>');
  });

  it('renders a full-window neutral screen for everything else', () => {
    for (const [role, text] of [
      [null, 'Loading'],
      ['guest', 'This account cannot open this workspace here.'],
    ] as const) {
      const html = gateFor(role);
      expect(html, String(role)).toContain(text);
      expect(html, String(role)).toContain('min-h-dvh');
      expect(html, String(role)).not.toContain('ADMIN-SCREEN');
      expect(html, String(role)).not.toContain('MEMBER-SCREEN');
      expect(html, String(role)).not.toContain('CLIENT-PORTAL');
    }
  });

  it('offers Try again (and Sign out) when the probe failed, not the shell', () => {
    const html = gateFor(null, true);
    expect(html).toContain('Could not load your workspace');
    expect(html).toContain('Try again');
    expect(html).toContain('Sign out');
    expect(html).toContain('Reconnecting');
    expect(html).not.toContain('ADMIN-SCREEN');
  });

  it('the failure card is an alert the keyboard can land on', () => {
    const html = gateFor(null, true);
    expect(html).toMatch(/<section role="alert" tabindex="-1"/);
  });

  it('says what failed, and never "the brain did not answer" for an answer', () => {
    expect(gateFor(null, true, 'offline')).toContain('This device is offline.');
    expect(gateFor(null, true, 'unreachable')).toContain('The brain could not be reached.');
    for (const html of [gateFor(null, true, 'error'), gateFor(null, true)]) {
      expect(html).toContain('Something went wrong while loading it.');
      expect(html).not.toMatch(/did not answer|could not be reached|offline/i);
    }
  });

  it('a failed probe never overrides a role the brain gave', () => {
    expect(gateFor('client', true)).toBe('<p>CLIENT-PORTAL</p>');
    expect(gateFor('admin', true)).toContain('ADMIN-SCREEN');
  });
});

describe('Sign out on a neutral screen (client tier audit U12)', () => {
  it('sends a client login to the client sign-in page, anyone else to /login', () => {
    expect(neutralSignOutPath(true)).toBe('/client-signin');
    expect(neutralSignOutPath(false)).toBe('/login');
  });
});
