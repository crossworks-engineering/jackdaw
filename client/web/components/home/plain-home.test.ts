import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout/page-title', () => ({ SetPageTitle: () => null }));

const { HOME_LINKS, HOME_SECTION_LIMIT, PlainHomeView } = await import('./plain-home');

/**
 * The Built-in home (task d78e7bde): every workspace's default landing page,
 * for every login. The screens it works in and the login's workspaces; with
 * the landing page's data (GET /api/home?ws=), that workspace's counts,
 * newest pages and apps.
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

describe('PlainHomeView with the landing page data', () => {
  const page = (n: number) => ({
    token: `p${n}`,
    title: `Page ${n}`,
    icon: null,
    summary: n === 1 ? 'The first one' : null,
    updatedAt: '2026-10-12T00:00:00.000Z',
    parentToken: null,
  });
  const html = renderToStaticMarkup(
    createElement(PlainHomeView, {
      workspaces: [ws('w1', 'Team')],
      scope: 'Team',
      hub: {
        sections: Array.from({ length: HOME_SECTION_LIMIT + 2 }, (_, i) => page(i + 1)),
        counts: { page: 12, note: 3, file: 0, table: 1, draw: 0 },
        apps: [{ token: 'a1', title: 'Board', description: 'Who is where', updatedAt: '' }],
      },
    }),
  );

  it('names the workspace it shows', () => {
    expect(html).toContain('>Team</p>');
  });

  it('counts each kind on its screen card', () => {
    expect(html).toMatch(/>Pages<\/div><span[^>]*>12</);
    expect(html).toMatch(/>Notes<\/div><span[^>]*>3</);
    // Apps has its own section, not a count.
    expect(html).not.toMatch(/>Apps<\/div><span/);
  });

  it('lists the newest pages, each a link, up to the limit', () => {
    expect(html).toContain('href="/pages/p1"');
    expect(html).toContain('The first one');
    expect(html).toContain(`href="/pages/p${HOME_SECTION_LIMIT}"`);
    expect(html).not.toContain(`href="/pages/p${HOME_SECTION_LIMIT + 1}"`);
  });

  it('lists the apps it holds', () => {
    expect(html).toContain('href="/apps/a1"');
    expect(html).toContain('Who is where');
  });

  it('says so when the workspace has no pages', () => {
    const empty = renderToStaticMarkup(
      createElement(PlainHomeView, {
        workspaces: [],
        hub: { sections: [], counts: {}, apps: [] },
      }),
    );
    expect(empty).toContain('No pages here yet.');
    expect(empty).not.toContain('>Apps</h2>');
  });
});
