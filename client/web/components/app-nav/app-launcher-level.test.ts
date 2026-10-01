import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clientAppHref,
  clientAppsHref,
  clientLauncherLevel,
  type ClientAppListWire,
} from '../../lib/client-apps';
import {
  memberAppHref,
  memberAppsHref,
  memberLauncherLevel,
  type MemberAppListWire,
} from '../../lib/member-apps';
import type { LauncherLevel } from '../../lib/app-launcher';
import { AppLauncherLevel, type LauncherCard } from './app-launcher-level';

/**
 * The Apps launcher of a member and of a client with the admin's folders,
 * read only: a folder is a tile (its icon and colour) that links to
 * `folder=`, the crumbs lead back, top level apps sit next to the folders,
 * and nothing on the screen creates, renames, moves or shares. The grouping
 * itself is pinned in lib/app-launcher.test.ts.
 */
const read = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const level = read('./app-launcher-level.tsx');
const memberScreen = read('../member/member-apps.tsx');
const clientScreen = read('../client/client-apps.tsx');

const folders = [
  { id: 'f1', name: 'Projects', icon: '🚀', color: 'teal' as const, parentId: null, appIds: [] },
  { id: 'f2', name: 'Reports', icon: null, color: null, parentId: 'f1', appIds: ['b'] },
];
const draw = <T extends LauncherCard>(
  lvl: LauncherLevel<T>,
  hrefs: { app: (id: string) => string; folder: (id: string | null) => string },
) =>
  renderToStaticMarkup(
    createElement(AppLauncherLevel<T>, {
      level: lvl,
      appHref: hrefs.app,
      folderHref: hrefs.folder,
      empty: createElement('p', null, 'Nothing here.'),
    }),
  );

describe('the member Apps launcher', () => {
  const card = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `App ${id}`,
    icon: null,
    color: null,
    description: null,
    audience: 'team' as const,
    updatedAt: '2026-10-01T00:00:00Z',
    ...extra,
  });
  const wire: MemberAppListWire = {
    apps: [card('a'), card('b', { dataReadOnly: true, description: 'Reads only' }), card('home')],
    homeAppId: 'home',
    folders,
  };
  const hrefs = { app: memberAppHref, folder: memberAppsHref };
  const at = (list: MemberAppListWire, folderId: string | null) =>
    draw(memberLauncherLevel(list, folderId)!, hrefs);

  it('shows a folder tile with its look next to the top level apps', () => {
    const html = at(wire, null);
    expect(html).toMatch(/<a[^>]*href="\/apps\?folder=f1"/);
    expect(html).toContain('Projects');
    expect(html).toContain('1 app');
    expect(html).toContain('🚀');
    expect(html).toContain('bg-app-tint-teal');
    expect(html).toMatch(/<a[^>]*href="\/apps\/a"/);
    // No crumbs at the top level, and the home app is not a card.
    expect(html).not.toContain('aria-label="Folders"');
    expect(html).not.toContain('/apps/home');
    // An app inside a folder is not also at the top level.
    expect(html).not.toContain('/apps/b');
  });

  it('opens a folder to its apps, with crumbs back and the informational tag kept', () => {
    const html = at(wire, 'f2');
    expect(html).toContain('aria-label="Folders"');
    expect(html).toMatch(/<a[^>]*href="\/apps"[^>]*>Apps<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/apps\?folder=f1"[^>]*>Projects<\/a>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Reports</);
    expect(html).toMatch(/<a[^>]*href="\/apps\/b"/);
    expect(html).toContain('Reads only');
    expect(html).toContain('Informational');
    expect(html).not.toContain('/apps/a"');
  });

  it('an older brain (no folders) draws today’s flat grid', () => {
    const html = at({ apps: wire.apps, homeAppId: 'home' }, null);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).not.toContain('?folder=');
    expect(html).toMatch(/href="\/apps\/a"/);
    expect(html).toMatch(/href="\/apps\/b"/);
  });

  it('says so when there is nothing to run', () => {
    const html = at({ apps: [card('home')], homeAppId: 'home', folders }, null);
    expect(html).toBe('<p>Nothing here.</p>');
    expect(memberScreen).toContain('empty={<p className="text-sm text-muted-foreground">');
  });
});

describe('the client Apps launcher', () => {
  const card = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `App ${id}`,
    icon: null,
    color: null,
    description: null,
    updatedAt: '2026-10-01T00:00:00Z',
    dataReadOnly: false,
    ...extra,
  });
  const wire: ClientAppListWire = {
    apps: [card('a'), card('b', { dataReadOnly: true, description: 'Order status' })],
    folders,
  };
  const hrefs = { app: clientAppHref, folder: clientAppsHref };
  const at = (list: ClientAppListWire, folderId: string | null, q = '') =>
    draw(clientLauncherLevel(list, folderId, q), hrefs);

  it('shows the same folder tiles, on the portal’s one path', () => {
    const html = at(wire, null);
    expect(html).toMatch(/<a[^>]*href="\/\?view=apps&amp;folder=f1"/);
    expect(html).toContain('Projects');
    expect(html).toContain('bg-app-tint-teal');
    expect(html).toMatch(/<a[^>]*href="\/\?view=apps&amp;id=a"/);
    expect(html).not.toContain('id=b');
    // Never a member or an owner link.
    expect(html).not.toMatch(/href="\/apps/);
  });

  it('opens a folder with crumbs back to the client Apps screen', () => {
    const html = at(wire, 'f2');
    expect(html).toMatch(/<a[^>]*href="\/\?view=apps"[^>]*>Apps<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/\?view=apps&amp;folder=f1"[^>]*>Projects<\/a>/);
    expect(html).toMatch(/aria-current="page"[^>]*>Reports</);
    expect(html).toMatch(/<a[^>]*href="\/\?view=apps&amp;id=b"/);
    expect(html).toContain('Informational');
  });

  it('a search lists the matching apps flat, from every folder', () => {
    const html = at(wire, 'f2', 'order');
    expect(html).not.toContain('aria-label="Folders"');
    expect(html).not.toContain('folder=');
    expect(html.match(/<li/g)).toHaveLength(1);
    expect(html).toMatch(/id=b"/);
    expect(at(wire, null, 'no such app')).toBe('<p>Nothing here.</p>');
  });

  it('an older brain (no folders), and a folder that is gone, draw the flat or the top level', () => {
    const flat = at({ apps: wire.apps }, null);
    expect(flat.match(/<li/g)).toHaveLength(2);
    expect(flat).not.toContain('folder=');
    expect(at(wire, 'gone')).toBe(at(wire, null));
  });
});

describe('both launchers', () => {
  it('are read only: links, and no control that writes', () => {
    const member = memberLauncherLevel(
      { apps: [], homeAppId: null, folders: [] } as MemberAppListWire,
      null,
    )!;
    expect(draw(member, { app: memberAppHref, folder: memberAppsHref })).toBe(
      '<p>Nothing here.</p>',
    );
    expect(level).not.toMatch(/<button|<input|draggable|contentEditable|onClick|onDrop/);
    // The level asks the brain nothing; each screen makes one read, of its
    // own list, and no tree or owner apps route.
    expect(level).not.toMatch(/apiFetch|apiSend|useQuery/);
    expect(memberScreen + clientScreen).not.toMatch(/apiSend|\/api\/tree|\/api\/app-nav/);
    expect(memberScreen.match(/apiFetch</g)).toHaveLength(1);
    expect(memberScreen).toContain("apiFetch<MemberAppListWire>('/api/member/apps')");
    expect(memberScreen).not.toContain("'/api/apps");
    expect(clientScreen.match(/apiFetch</g)).toHaveLength(1);
    expect(clientScreen).toContain('apiFetch<ClientAppListWire>(CLIENT_APPS_ROUTE)');
  });

  it('fit a phone: a 16px gutter, one column, and names that cut instead of pushing', () => {
    expect(memberScreen).toContain('className="mx-auto max-w-4xl space-y-4 p-4 md:p-8"');
    expect(clientScreen).toContain('<ItemListScroll className="space-y-4 p-4">');
    expect(level).toContain('className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"');
    expect(level).toContain('flex min-w-0 flex-wrap items-center gap-1 text-sm');
    expect(level.match(/<li key=\{[a-z.]+id\} className="min-w-0">/g)).toHaveLength(2);
  });
});
