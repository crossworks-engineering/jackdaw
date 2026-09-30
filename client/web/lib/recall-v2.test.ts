import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { RecallCardDetailDTO, RecallMapSummaryDTO } from '@mantle/web-ui/types/recall-v2';
import {
  budgetState,
  cardProblems,
  cardWriteBody,
  dropCard,
  editsOf,
  isPageBuilt,
  isStale,
  moveCard,
  optionTargets,
  optionTargetValue,
  recallV2Of,
  restoreBlockedReason,
  sameEdits,
  withOption,
  writeErrorText,
} from './recall-v2';

function card(over: Partial<RecallCardDetailDTO> = {}): RecallCardDetailDTO {
  return {
    id: 'c1',
    slug: 'fleet',
    kind: 'knowledge',
    title: 'Fleet',
    useWhen: '',
    bodyChars: 4,
    bodyMd: 'body',
    options: [],
    sourceVersion: 3,
    rank: 1,
    promptPending: false,
    updatedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

function summary(over: Partial<RecallMapSummaryDTO> = {}): RecallMapSummaryDTO {
  return {
    id: 'm1',
    slug: 'mantle',
    title: 'Mantle',
    enterWhen: 'working on mantle',
    nodeCount: 2,
    lastCompileOk: true,
    nodeId: 'm1',
    folder: null,
    published: true,
    version: 3,
    updatedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

describe('recallV2Of', () => {
  it('is undefined until the shell answers', () => {
    expect(recallV2Of(undefined)).toBeUndefined();
  });
  it('reads an older brain (no features object) as false', () => {
    expect(recallV2Of({ onboarded: true })).toBe(false);
  });
  it('is true only for a literal true', () => {
    expect(recallV2Of({ features: { recallV2: true } })).toBe(true);
    expect(recallV2Of({ features: { recallV2: 'yes' } })).toBe(false);
  });
});

describe('isPageBuilt', () => {
  it('is the nodeId null test', () => {
    expect(isPageBuilt({ nodeId: null })).toBe(true);
    expect(isPageBuilt({ nodeId: 'x' })).toBe(false);
  });
});

describe('cardWriteBody', () => {
  it('keeps a prompt a prompt: a PUT without prompt:true demotes it', () => {
    const body = cardWriteBody(editsOf(card({ kind: 'prompt', useWhen: 'deploying' })), 7);
    expect(body.prompt).toBe(true);
    expect(body.useWhen).toBe('deploying');
    expect(body.version).toBe(7);
  });
  it('always sends the whole option list, without the brain-owned targetId', () => {
    const c = card({
      options: [{ label: 'Boxes', useWhen: 'which box', targetSlug: 'boxes', targetId: 'id-1' }],
    });
    const body = cardWriteBody(editsOf(c), 1);
    expect(body.options).toEqual([{ label: 'Boxes', useWhen: 'which box', targetSlug: 'boxes' }]);
  });
  it('keeps a cross-map target', () => {
    const c = card({
      options: [{ label: 'DFM', useWhen: '', targetSlug: 'dfm', targetMap: 'dfm' }],
    });
    expect(cardWriteBody(editsOf(c), 1).options?.[0]?.targetMap).toBe('dfm');
  });
  it('trims the title and use-when, and adds `after` only for a new card', () => {
    const e = { ...editsOf(card()), title: '  Fleet  ', useWhen: ' x ' };
    const body = cardWriteBody(e, 1);
    expect(body.title).toBe('Fleet');
    expect(body.useWhen).toBe('x');
    expect('after' in body).toBe(false);
    expect(cardWriteBody(e, 1, 'start').after).toBe('start');
  });
});

describe('sameEdits', () => {
  it('ignores targetId, which the brain adds', () => {
    const a = editsOf(
      card({ options: [{ label: 'a', useWhen: '', targetSlug: 'b', targetId: 'i' }] }),
    );
    const b = { ...a, options: [{ label: 'a', useWhen: '', targetSlug: 'b' }] };
    expect(sameEdits(a, b)).toBe(true);
    expect(sameEdits(a, { ...a, bodyMd: 'changed' })).toBe(false);
  });
});

describe('cardProblems', () => {
  it('mirrors the refusals the brain would send', () => {
    const e = { title: ' ', bodyMd: 'x'.repeat(11), useWhen: '', prompt: true, options: [] };
    const p = cardProblems(e, 10);
    expect(p.title).toBeDefined();
    expect(p.bodyMd).toMatch(/^1 characters over the 10 budget/);
    expect(p.useWhen).toBeDefined();
  });
  it('flags an option with no label or no target', () => {
    const e = { ...editsOf(card()), options: [{ label: 'a', useWhen: '', targetSlug: '' }] };
    expect(cardProblems(e, 6000).options).toBe('Option 1 needs a label and a target.');
  });
  it('is empty for a good card', () => {
    expect(cardProblems(editsOf(card()), 6000)).toEqual({});
  });
});

describe('budgetState', () => {
  it('warns from 90% and refuses past the budget', () => {
    expect(budgetState(899, 1000)).toBe('ok');
    expect(budgetState(900, 1000)).toBe('near');
    expect(budgetState(1000, 1000)).toBe('near');
    expect(budgetState(1001, 1000)).toBe('over');
  });
});

describe('moveCard', () => {
  const nodes = [{ slug: 'start' }, { slug: 'a' }, { slug: 'b' }];
  it('swaps with the neighbour and returns the FULL order', () => {
    expect(moveCard(nodes, 'b', -1)).toEqual(['start', 'b', 'a']);
    expect(moveCard(nodes, 'a', 1)).toEqual(['start', 'b', 'a']);
  });
  it('never moves the entry card, nor anything above it', () => {
    expect(moveCard(nodes, 'start', 1)).toBeNull();
    expect(moveCard(nodes, 'a', -1)).toBeNull();
  });
  it('is null off either end or for an unknown slug', () => {
    expect(moveCard(nodes, 'b', 1)).toBeNull();
    expect(moveCard(nodes, 'zz', 1)).toBeNull();
  });
});

describe('dropCard', () => {
  const nodes = [{ slug: 'start' }, { slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
  it('moves a card to where it was dropped, returning the FULL order', () => {
    expect(dropCard(nodes, 'c', 'a')).toEqual(['start', 'c', 'a', 'b']);
    expect(dropCard(nodes, 'a', 'c')).toEqual(['start', 'b', 'c', 'a']);
  });
  it('lands a card dropped on the entry card just below it', () => {
    expect(dropCard(nodes, 'c', 'start')).toEqual(['start', 'c', 'a', 'b']);
    expect(dropCard(nodes, 'a', 'start')).toBeNull();
  });
  it('never moves the entry card, and a drop in place is a no-op', () => {
    expect(dropCard(nodes, 'start', 'b')).toBeNull();
    expect(dropCard(nodes, 'b', 'b')).toBeNull();
    expect(dropCard(nodes, 'zz', 'b')).toBeNull();
  });
});

describe('withOption', () => {
  it('appends without touching the existing options', () => {
    const e = editsOf(card({ options: [{ label: 'a', useWhen: '', targetSlug: 'x' }] }));
    const next = withOption(e, { label: 'b', useWhen: '', targetSlug: 'y', targetId: 'drop-me' });
    expect(next.options).toEqual([
      { label: 'a', useWhen: '', targetSlug: 'x' },
      { label: 'b', useWhen: '', targetSlug: 'y' },
    ]);
    expect(e.options).toHaveLength(1);
  });
});

describe('write errors', () => {
  const stale = new ApiError('changed', 409, { error: 'changed', code: 'version_stale' });
  it('recognises a stale version by its code', () => {
    expect(isStale(stale)).toBe(true);
    expect(isStale(new ApiError('x', 400, { error: 'x', code: 'body_too_long' }))).toBe(false);
    expect(isStale(new Error('x'))).toBe(false);
  });
  it('passes the brain teaching error through as written', () => {
    const e = new ApiError('fallback', 400, { error: 'Split it.', code: 'body_too_long' });
    expect(writeErrorText(e, 'Save failed.')).toBe('Split it.');
  });
  it('words a stale version as the editor sees it', () => {
    expect(writeErrorText(stale, 'Save failed.')).toMatch(/changed since you opened it/);
  });
  it('falls back for something that is not an error', () => {
    expect(writeErrorText('nope', 'Save failed.')).toBe('Save failed.');
  });
});

describe('restore guards', () => {
  it('blocks only the revisions whose restore would change nothing', () => {
    for (const s of ['map created', 'cards reordered']) {
      expect(restoreBlockedReason({ summary: s })).not.toBeNull();
    }
    for (const s of ['card edited', 'card deleted', 'prompt confirmed', 'prompt request dropped']) {
      expect(restoreBlockedReason({ summary: s })).toBeNull();
    }
  });
});

describe('optionTargets', () => {
  const map = {
    slug: 'mantle',
    nodes: [
      { slug: 'start', title: 'Mantle' },
      { slug: 'fleet', title: 'Fleet' },
    ],
  };
  it('offers every other card, and the entry of other published native maps', () => {
    const maps = [
      summary(),
      summary({ id: 'd', slug: 'dfm', title: 'DFM' }),
      summary({ id: 'u', slug: 'draft', title: 'Draft', published: false }),
      summary({ id: 'v', slug: 'old', title: 'Old', nodeId: null }),
    ];
    const t = optionTargets(map, 'fleet', maps);
    expect(t.map((x) => x.value)).toEqual(['card:start', 'map:dfm']);
    expect(t[1]).toMatchObject({ targetSlug: 'dfm', targetMap: 'dfm' });
  });
  it('round-trips an option to its select value', () => {
    expect(optionTargetValue({ targetSlug: 'fleet' })).toBe('card:fleet');
    expect(optionTargetValue({ targetSlug: 'dfm', targetMap: 'dfm' })).toBe('map:dfm');
  });
});
