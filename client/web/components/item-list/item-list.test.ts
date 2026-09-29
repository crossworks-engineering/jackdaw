import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ItemCard, ItemCardAction, ItemIcon } from './item-card';
import { StatePill, stateLabel, type ItemState } from './state-pill';

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
  const states: ItemState[] = ['private', 'draft', 'submitted', 'returned', 'with-admin'];

  it('says each state in plain words, lower case, like [private]', () => {
    expect(states.map(stateLabel)).toEqual([
      'private',
      'draft',
      'submitted',
      'returned',
      'with admin',
    ]);
    for (const s of states) {
      const html = renderToStaticMarkup(createElement(StatePill, { state: s }));
      expect(html).toContain(`>${stateLabel(s)}<`);
      expect(html).toContain('rounded-full');
      // Ink roles only: a status fill used as text can vanish on some themes.
      expect(html).not.toMatch(/text-(info|warning|destructive|success)(?!-ink)\b/);
    }
  });
});

describe('the admin /pages list is built from the kit', () => {
  const src = readFileSync(join(__dirname, '../../app/(app)/pages/pages-client.tsx'), 'utf8');

  it('uses the kit header, card, filters and pager instead of its own', () => {
    for (const part of ['<ItemListHeader', '<ItemCard', '<SortMenu', '<TagFilter', '<ListPager']) {
      expect(src).toContain(part);
    }
    expect(src).not.toMatch(/function TagFilter\(/);
    expect(src).not.toMatch(/aria-label="Previous page"/);
  });
});
