import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { launcherLevel, type MemberAppListWire } from '../../lib/member-apps';
import { MemberAppsLevel } from './member-apps-level';

/**
 * The member Apps launcher with the admin's folders, read only: a folder is
 * a tile (its icon and colour) that links to `?folder=`, the crumbs lead
 * back, top level apps sit next to the folders, and nothing on the screen
 * creates, renames, moves or shares. The grouping itself is pinned in
 * lib/member-apps.test.ts.
 */
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
  folders: [
    { id: 'f1', name: 'Projects', icon: '🚀', color: 'teal', parentId: null, appIds: [] },
    { id: 'f2', name: 'Reports', icon: null, color: null, parentId: 'f1', appIds: ['b'] },
  ],
};
const draw = (list: MemberAppListWire, folderId: string | null) =>
  renderToStaticMarkup(createElement(MemberAppsLevel, { level: launcherLevel(list, folderId)! }));
const read = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const screen = read('./member-apps.tsx');
const level = read('./member-apps-level.tsx');

describe('the member Apps launcher', () => {
  it('shows a folder tile with its look next to the top level apps', () => {
    const html = draw(wire, null);
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
    const html = draw(wire, 'f2');
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
    const html = draw({ apps: wire.apps, homeAppId: 'home' }, null);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).not.toContain('?folder=');
    expect(html).toMatch(/href="\/apps\/a"/);
    expect(html).toMatch(/href="\/apps\/b"/);
  });

  it('says so when there is nothing to run', () => {
    const html = draw({ apps: [card('home')], homeAppId: 'home', folders: wire.folders }, null);
    expect(html).toContain('No apps yet.');
  });

  it('is read only: links, and no control that writes', () => {
    const html = draw(wire, null) + draw(wire, 'f1') + draw(wire, 'f2');
    expect(html).not.toMatch(/<button|<input|draggable|contenteditable/);
    // The only request is the read; no tree or owner apps route.
    expect(screen + level).not.toMatch(/apiSend|\/api\/tree|\/api\/apps|\/api\/app-nav/);
    expect(screen.match(/apiFetch</g)).toHaveLength(1);
    expect(screen).toContain("apiFetch<MemberAppListWire>('/api/member/apps')");
    expect(level).not.toContain('apiFetch');
  });

  it('fits a phone: a 16px gutter, one column, and names that cut instead of pushing', () => {
    expect(screen).toContain('className="mx-auto max-w-4xl space-y-4 p-4 md:p-8"');
    expect(level).toContain('className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"');
    expect(level).toContain('flex min-w-0 flex-wrap items-center gap-1 text-sm');
    expect(level.match(/<li key=\{[a-z.]+id\} className="min-w-0">/g)).toHaveLength(2);
  });
});
