import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout/page-title', () => ({ SetPageTitle: () => null }));

const { HOME_LINKS, HomeSwitch, PlainHomeView } = await import('./plain-home');

/**
 * The home (phase W5c): a member's own home, the dashboard for an admin
 * with the settings area, and a plain home for anyone else: the login's
 * workspaces and the screens it works in.
 */
const ws = (id: string, name: string, over: { isAdmin?: boolean; moderator?: boolean } = {}) => ({
  id,
  name,
  isAdmin: over.isAdmin ?? false,
  moderator: over.moderator ?? false,
});

describe('PlainHomeView', () => {
  const html = renderToStaticMarkup(
    createElement(PlainHomeView, {
      workspaces: [ws('w2', 'Zeta'), ws('w1', 'Alpha', { moderator: true })],
    }),
  );

  it('says Home, as its one header', () => {
    expect(html).toContain('<h1 class="text-2xl font-semibold">Home</h1>');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('lists the workspaces by name, each a link to its screen, Moderator marked', () => {
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Zeta'));
    expect(html).toContain('href="/settings/workspaces?selected=w1"');
    expect(html).toContain('href="/settings/workspaces?selected=w2"');
    expect(html.match(/Moderator/g)).toHaveLength(1);
  });

  it('links to every workspace screen', () => {
    expect(HOME_LINKS.map((l) => l.href)).toEqual([
      '/pages',
      '/notes',
      '/files',
      '/tables',
      '/draw',
      '/apps',
    ]);
    for (const l of HOME_LINKS) {
      expect(html).toContain(`href="${l.href}"`);
      expect(html).toContain(`>${l.label}<`);
    }
  });

  it('says so when the login is in no workspace', () => {
    const empty = renderToStaticMarkup(createElement(PlainHomeView, { workspaces: [] }));
    expect(empty).toContain('You are not in a workspace yet.');
  });
});

describe('HomeSwitch', () => {
  const render = (shell: unknown) => {
    const client = new QueryClient();
    client.setQueryData(['shell'], shell);
    return renderToStaticMarkup(
      createElement(QueryClientProvider, {
        client,
        children: createElement(HomeSwitch, {
          dashboard: createElement('p', null, 'DASHBOARD'),
          member: createElement('p', null, 'MEMBER-HOME'),
        }),
      }),
    );
  };

  it('a member gets its own home, whatever the shell holds', () => {
    expect(render({ role: 'member', areas: ['settings'] })).toBe('<p>MEMBER-HOME</p>');
  });

  it('a client gets the plain home with its workspaces', () => {
    const html = render({ role: 'client', areas: [], workspaces: [ws('w1', 'Clients')] });
    expect(html).toContain('Clients');
    expect(html).not.toMatch(/DASHBOARD|MEMBER-HOME/);
  });

  it('an admin gets the dashboard with the settings area, and on a brain that names none', () => {
    expect(render({ role: 'admin', areas: ['settings'], workspaces: [] })).toBe('<p>DASHBOARD</p>');
    expect(render({ siteName: null })).toBe('<p>DASHBOARD</p>');
  });

  it('an admin without the settings area gets the plain home', () => {
    const html = render({ role: 'admin', areas: ['users'], workspaces: [ws('w1', 'Team')] });
    expect(html).not.toContain('DASHBOARD');
    expect(html).toContain('Team');
  });
});
