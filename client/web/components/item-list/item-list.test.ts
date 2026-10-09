import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ItemCard, ItemCardAction, ItemIcon } from './item-card';
import { StatePill, stateLabel, stateTitle, type ItemState } from './state-pill';
import { mergeSortedRows } from './merge-rows';

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
    expect(states.map((st) => stateLabel(st))).toEqual([
      'private',
      'draft',
      'submitted',
      'rejected',
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

  it('says no staff role to a client (audit U3); a member keeps its words', () => {
    for (const s of states) {
      // What a person reads: the words and the hover (the data-state hook
      // is the brain's code, for the tests and styles, never shown).
      const html = renderToStaticMarkup(createElement(StatePill, { state: s, client: true }));
      expect(html.replace(/ data-state="[^"]*"/, '')).not.toMatch(/admin/i);
      expect(stateTitle(s, true)).not.toMatch(/admin/i);
    }
    expect(stateLabel('with-admin', true)).toBe('with the team');
    expect(stateTitle('returned', true)).toBe('Rejected: change it and submit it again');
    // The member's and the admin's own words stay.
    expect(stateLabel('with-admin')).toBe('with admin');
    expect(stateTitle('submitted')).toMatch(/admin/);
  });
});

describe('mergeSortedRows', () => {
  const byNum = (a: number, b: number) => a - b;
  it('interleaves two ordered lists, keeping each one’s order and `a` first on a tie', () => {
    expect(mergeSortedRows([1, 3, 5], [2, 3, 6], byNum)).toEqual([1, 2, 3, 3, 5, 6]);
    expect(mergeSortedRows([], [2], byNum)).toEqual([2]);
    expect(mergeSortedRows([1], [], byNum)).toEqual([1]);
    const tagged = mergeSortedRows([{ k: 1, s: 'a' }], [{ k: 1, s: 'b' }], (x, y) => x.k - y.k);
    expect(tagged.map((t) => t.s)).toEqual(['a', 'b']);
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
    for (const part of [
      '<ItemListHeader',
      '<ItemCard',
      '<TagFilter',
      '<StateFilter',
      '<ListPager',
    ]) {
      expect(src, part).toContain(part);
    }
    // No hand-rolled pager or tag filter of its own.
    expect(src).not.toMatch(/function TagFilter\(/);
    expect(src).not.toMatch(/aria-label="Previous page"/);
  });
});

describe('every admin list shows the admin’s private items beside the brain’s (D1)', () => {
  it.each(Object.entries(SCREENS))('%s asks for them and lists them with the pill', (_, rel) => {
    const src = read(rel);
    // The brain's default is `brain` (older clients): the screen always sends it.
    expect(src).toMatch(/qs\.set\('state', state\)/);
    expect(src).toContain('<PrivateItemCard');
    expect(src).toContain('<PrivateItemDetail');
  });

  it('files lists them in its root folder and in Recent', () => {
    const src = read('../../app/(app)/files/files-client.tsx');
    expect(src).toContain('&state=all');
    expect(src).toContain('<StatePill state="private" />');
    expect(src).toContain('<PrivateItemDetail');
  });

  it('no screen keeps the Brain / Private switch', () => {
    for (const rel of [...Object.values(SCREENS), '../../app/(app)/files/files-client.tsx']) {
      expect(read(rel)).not.toContain('SpaceSwitch');
    }
    expect(read('../member/admin-private-workspace.tsx')).not.toMatch(
      /export function SpaceSwitch/,
    );
  });
});

describe("the member workspace is the admin's folder view (2026-10-09)", () => {
  const src = read('../member/member-workspace.tsx');

  it('shows the item tree only: no list, no view switch, no State filter, no pager', () => {
    expect(src).toContain('<ItemTree');
    expect(src).toContain('source="member"');
    expect(src).toContain('<MemberItemSections');
    for (const gone of [
      '<ItemListHeader',
      '<ItemCard',
      '<StateFilter',
      '<ListPager',
      'ReaderViewToggle',
      'readerViewOf',
      'MEMBER_STATE_OPTIONS',
    ]) {
      expect(src, gone).not.toContain(gone);
    }
  });

  it('sizes its panes as each admin screen does', () => {
    expect(src).toMatch(/<MasterDetail id=\{`member-\$\{kind\}`\} \{\.\.\.LAYOUT\[kind\]\}/);
    expect(src).toContain("note: {\n    defaultListSize: '380px'");
  });
});

describe('the client portal is the same list (P5)', () => {
  const src = read('../client/client-home.tsx');

  it('uses the kit, keeps its state in the URL, and shows no summary (0.232.333)', () => {
    for (const part of ['<ItemListHeader', '<ClientSharedCard', '<ChoiceFilter', '<ListPager']) {
      expect(src, part).toContain(part);
    }
    expect(src).toContain("params.get('kind')");
    expect(src).toContain("params.get('q')");
    expect(src).not.toContain('summary');
    // Read-only: no state pill, no actions.
    expect(src).not.toContain('StatePill');
    expect(src).not.toContain('actions=');
    // The card is the kit's.
    expect(read('../client/client-shared-card.tsx')).toContain('<ItemCard');
  });
});
