import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ItemCard, ItemCardAction, ItemIcon } from './item-card';
import { StatePill, pillState, stateLabel, stateTitle, type ItemState } from './state-pill';

/**
 * The shared list kit (item-list alignment): one card, one pill, one header
 * for every list screen. These pin the card's anatomy (the title first, then
 * the footer: stamp at the start, the pill LEFT of the actions) and the
 * pill's words, which the lists and the State filter share.
 */
const card = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ItemCard, {
      id: 'i1',
      kind: 'page',
      title: 'Plan',
      icon: createElement(ItemIcon, { emoji: '📄', fallback: null }),
      onSelect: () => {},
      updatedAt: new Date().toISOString(),
      ...extra,
    }),
  );

describe('ItemCard', () => {
  it('puts the pill left of the actions in the footer', () => {
    const html = card({
      pill: createElement(StatePill, { state: 'private' }),
      actions: createElement(ItemCardAction, { label: 'Move page' }, 'M'),
    });
    const pill = html.indexOf('data-state="private"');
    const move = html.indexOf('aria-label="Move page"');
    expect(pill).toBeGreaterThan(html.indexOf('Plan'));
    expect(pill).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(pill);
  });

  it('shows no pill and no action it was not given', () => {
    const html = card();
    expect(html).not.toContain('data-state=');
    expect(html).not.toContain('aria-label="Move page"');
    // The updated stamp fills the footer's start by default.
    expect(html).toMatch(/title="Updated /);
  });

  it('keeps the marking attributes on the title button', () => {
    const html = card();
    expect(html).toContain('data-mark-id="i1"');
    expect(html).toContain('data-mark-kind="page"');
    expect(html).toContain('data-mark-label="Plan"');
  });

  it('names an untitled item', () => {
    expect(card({ title: '' })).toContain('Untitled');
  });
});

describe('StatePill', () => {
  const states: ItemState[] = ['private', 'draft'];

  it('says each state in plain words, lower case, like [private]', () => {
    expect(states.map((st) => stateLabel(st))).toEqual(['private', 'draft']);
    for (const s of states) {
      const html = renderToStaticMarkup(createElement(StatePill, { state: s }));
      expect(html).toContain(`>${stateLabel(s)}<`);
      expect(html).toContain(`data-state="${s}"`);
      expect(html).toContain('rounded-full');
      // Ink roles only: a status fill used as text can vanish on some themes.
      expect(html).not.toMatch(/text-(info|warning|destructive|success)(?!-ink)\b/);
    }
  });

  it('has hover words for each state', () => {
    expect(stateTitle('private')).toBe('Private: only you can see it');
    expect(stateTitle('draft')).toBe('A draft shared with the team');
  });

  it('has no review pill (W5c): any other state shows as a draft', () => {
    for (const s of ['submitted', 'returned', 'with-admin', 'something-new', '']) {
      expect(pillState(s), s).toBe('draft');
      expect(stateLabel(s)).toBe('draft');
      const html = renderToStaticMarkup(createElement(StatePill, { state: s }));
      expect(html).toContain('data-state="draft"');
      expect(html).toContain('>draft<');
      expect(html).not.toMatch(/submitted|rejected|with admin/);
    }
  });
});

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const SCREENS = {
  pages: '../../app/(app)/pages/pages-client.tsx',
  notes: '../../app/(app)/notes/notes-client.tsx',
  tables: '../../app/(app)/tables/tables-shell.tsx',
  draw: '../../app/(app)/draw/draws-client.tsx',
} as const;

describe('the admin list screens are built from the kit', () => {
  it.each(Object.entries(SCREENS))('%s uses the kit header, card, filters and pager', (_, rel) => {
    const src = read(rel);
    for (const part of ['<ItemListHeader', '<ItemCard', '<TagFilter', '<ListPager']) {
      expect(src, part).toContain(part);
    }
    // No hand-rolled pager or tag filter of its own.
    expect(src).not.toMatch(/function TagFilter\(/);
    expect(src).not.toMatch(/aria-label="Previous page"/);
  });
});
