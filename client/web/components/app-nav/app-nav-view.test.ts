import { describe, expect, it } from 'vitest';
import type { AppNavItem, AppNavResponse } from '@mantle/client-types/app-nav';
import { folderAppCount, listApps, searchApps, unsortedApps } from './app-nav-view';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n: number, title: string, extra: Partial<AppNavItem> = {}): AppNavItem => ({
  id: id(n),
  title,
  icon: null,
  color: null,
  tags: [],
  description: null,
  hasBuild: true,
  updatedAt: `2026-09-${String(n).padStart(2, '0')}T00:00:00.000Z`,
  ...extra,
});

const data: AppNavResponse = {
  nav: {
    rev: 3,
    entries: [
      {
        kind: 'folder',
        id: id(100),
        name: 'Piping',
        children: [
          { kind: 'app', id: id(1) },
          { kind: 'app', id: id(2) },
        ],
      },
    ],
  },
  pins: [],
  opens: {
    [id(1)]: { n: 2, at: '2026-09-20T00:00:00.000Z' },
    [id(3)]: { n: 9, at: '2026-09-10T00:00:00.000Z' },
  },
  apps: [
    item(1, 'Risk Matrix'),
    item(2, 'Master Asset List', { tags: ['circuits'] }),
    item(3, 'Sprint Planner', { description: 'per-analyst risk hours' }),
    item(4, 'Damage Portal'),
  ],
};

describe('unsortedApps', () => {
  it('lists apps placed nowhere, newest first', () => {
    expect(unsortedApps(data).map((a) => a.title)).toEqual(['Damage Portal', 'Sprint Planner']);
  });
});

describe('listApps', () => {
  it('recent and most used only list opened apps', () => {
    expect(listApps(data, 'recent').map((a) => a.title)).toEqual(['Risk Matrix', 'Sprint Planner']);
    expect(listApps(data, 'used').map((a) => a.title)).toEqual(['Sprint Planner', 'Risk Matrix']);
  });
  it('A to Z lists everything, and a tag narrows it', () => {
    expect(listApps(data, 'az')).toHaveLength(4);
    expect(listApps(data, 'az', 'circuits').map((a) => a.title)).toEqual(['Master Asset List']);
  });
});

describe('searchApps', () => {
  it('ranks title hits before folder, tag and description hits', () => {
    const hits = searchApps(data, 'risk');
    expect(hits.map((h) => h.app.title)).toEqual(['Risk Matrix', 'Sprint Planner']);
    expect(hits[0]!.path).toEqual(['Piping']);
  });
  it('finds apps by the folder they sit in', () => {
    expect(searchApps(data, 'pip').map((h) => h.app.title)).toEqual([
      'Master Asset List',
      'Risk Matrix',
    ]);
  });
  it('is empty for a blank query', () => {
    expect(searchApps(data, '  ')).toEqual([]);
  });
});

describe('folderAppCount', () => {
  it('counts apps all levels down', () => {
    expect(folderAppCount(data.nav.entries[0]!)).toBe(2);
  });
});
