/**
 * The Recall v2 card editor's state rules, held against a real QueryClient
 * where the finding was about what TanStack Query does (a failed refetch
 * keeps its data; a write marks the map invalid until a refetch lands).
 */
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type {
  RecallCardDetailDTO,
  RecallMapDetailDTO,
  RecallNodeDTO,
} from '@mantle/web-ui/types/recall-v2';
import {
  cardPane,
  cardSync,
  detailPane,
  editorSync,
  editsOf,
  mapToPin,
  openCardOf,
  rebaseEdits,
  recallKeys,
  type CardSync,
} from './recall-v2';
import { guardedNavigate, setNavHold } from './nav-guard';

const T0 = '2026-09-30T10:00:00.000Z';
const T1 = '2026-09-30T10:05:00.000Z';

function node(over: Partial<RecallNodeDTO> = {}): RecallNodeDTO {
  return {
    id: 'c1',
    slug: 'fleet',
    kind: 'knowledge',
    title: 'Fleet',
    useWhen: '',
    bodyChars: 4,
    options: [],
    sourceVersion: 3,
    rank: 1,
    promptPending: false,
    updatedAt: T0,
    ...over,
  };
}

function card(over: Partial<RecallCardDetailDTO> = {}): RecallCardDetailDTO {
  return { ...node(), bodyMd: 'body', ...over };
}

function map(nodes: RecallNodeDTO[], version: number): RecallMapDetailDTO {
  return {
    id: 'm1',
    slug: 'mantle',
    title: 'Mantle',
    enterWhen: 'working on mantle',
    nodeCount: nodes.length,
    lastCompileOk: true,
    nodeId: 'm1',
    folder: null,
    published: true,
    version,
    updatedAt: T0,
    report: null,
    nodes,
  };
}

const entry = node({ id: 'c0', slug: 'start', kind: 'index', title: 'Mantle', rank: 0 });

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** A query function that answers from a list, then fails once it runs out:
 *  the "refetch rejects" case. */
function answers<T>(...values: T[]) {
  let i = 0;
  return async (): Promise<T> => {
    if (i < values.length) return values[i++]!;
    throw new Error('network down');
  };
}

/** The query as a component reads it. */
function read<T>(qc: QueryClient, key: readonly unknown[]) {
  const st = qc.getQueryState<T>(key);
  return {
    data: st?.data,
    isError: st?.status === 'error',
    isFetching: st?.fetchStatus === 'fetching',
    isInvalidated: st?.isInvalidated ?? false,
    dataUpdatedAt: st?.dataUpdatedAt ?? 0,
  };
}

const settledSync = {
  dirty: false,
  saving: false,
  gone: false,
  sync: 'match' as CardSync,
  settled: true,
  cardChanged: false,
  sameStamp: true,
  mapState: 'same' as const,
};

describe('R1: a cached card is never paired with a newer map version', () => {
  it('calls a card copy older than the map row behind, and a newer one ahead', () => {
    const fetched = { card: 1, map: 1 };
    expect(cardSync(node({ sourceVersion: 5 }), card({ sourceVersion: 4 }), fetched)).toBe(
      'card-behind',
    );
    expect(cardSync(node({ sourceVersion: 4 }), card({ sourceVersion: 5 }), fetched)).toBe(
      'map-behind',
    );
    expect(cardSync(node(), card(), fetched)).toBe('match');
  });

  it('ignores the targetId the list row carries', () => {
    const o = { label: 'Boxes', useWhen: 'which box', targetSlug: 'boxes' };
    expect(
      cardSync(node({ options: [{ ...o, targetId: 'id-1' }] }), card({ options: [o] }), {
        card: 1,
        map: 1,
      }),
    ).toBe('match');
  });

  it('catches a write that changes a card without moving its stamp (a map rename)', () => {
    const renamed = node({ slug: 'start', kind: 'index', title: 'Renamed' });
    const old = card({ slug: 'start', kind: 'index', title: 'Mantle' });
    // Same stamp, different title: the copy fetched longer ago is distrusted.
    expect(cardSync(renamed, old, { card: 1, map: 2 })).toBe('card-behind');
    expect(cardSync(renamed, old, { card: 2, map: 1 })).toBe('map-behind');
    // Same stamp, one row newer by its own updatedAt.
    expect(cardSync(node({ updatedAt: T1, title: 'New' }), card(), { card: 2, map: 1 })).toBe(
      'card-behind',
    );
  });

  it('does not mount the form on a card cached before an agent edit the map shows', async () => {
    // The finding: map M refetched to N+1 after an agent edited card X,
    // while X's copy from a few seconds before is still fresh in the cache.
    const qc = client();
    qc.setQueryData(
      recallKeys.map('m1'),
      map([entry, node({ sourceVersion: 8, updatedAt: T1 })], 8),
    );
    qc.setQueryData(recallKeys.card('m1', 'fleet'), card({ sourceVersion: 7, bodyMd: 'old' }), {
      updatedAt: Date.now() - 1000,
    });
    const m = read<RecallMapDetailDTO>(qc, recallKeys.map('m1'));
    const c = read<RecallCardDetailDTO>(qc, recallKeys.card('m1', 'fleet'));
    const sync = cardSync(m.data!.nodes[1]!, c.data!, {
      card: c.dataUpdatedAt,
      map: m.dataUpdatedAt,
    });
    expect(sync).toBe('card-behind');
    const before = cardPane({
      hasData: true,
      sync,
      isFetching: false,
      isError: false,
      mounted: false,
    });
    expect(before).toEqual({ show: 'loading', refetch: true, refreshFailed: false });
    // While the refetch runs: still loading, and not asked twice.
    expect(
      cardPane({ hasData: true, sync, isFetching: true, isError: false, mounted: false }),
    ).toEqual({ show: 'loading', refetch: false, refreshFailed: false });

    // The refetch brings the agent's copy: now it mounts.
    await qc.fetchQuery({
      queryKey: recallKeys.card('m1', 'fleet'),
      queryFn: answers(card({ sourceVersion: 8, updatedAt: T1, bodyMd: 'agent' })),
      staleTime: 0,
    });
    const c2 = read<RecallCardDetailDTO>(qc, recallKeys.card('m1', 'fleet'));
    const sync2 = cardSync(m.data!.nodes[1]!, c2.data!, {
      card: c2.dataUpdatedAt,
      map: m.dataUpdatedAt,
    });
    expect(sync2).toBe('match');
    expect(
      cardPane({ hasData: true, sync: sync2, isFetching: false, isError: false, mounted: false })
        .show,
    ).toBe('editor');
  });

  it('shows the error screen, not the stale copy, when that refetch fails before mount', () => {
    expect(
      cardPane({
        hasData: true,
        sync: 'card-behind',
        isFetching: false,
        isError: true,
        mounted: false,
      }).show,
    ).toBe('error');
  });

  it('once mounted, a copy found behind is the card-changed state, never a silent rebase', () => {
    const dirty = editorSync({
      ...settledSync,
      dirty: true,
      sync: 'card-behind',
      mapState: 'foreign',
    });
    expect(dirty).toEqual({ move: null, conflict: 'card' });
    // A clean form waits for the fresh copy instead of pairing the old text
    // with the new version.
    expect(
      editorSync({ ...settledSync, sync: 'card-behind', mapState: 'foreign' }).move,
    ).toBeNull();
    expect(editorSync({ ...settledSync, mapState: 'foreign' }).move).toBe('follow');
    // And asks for it.
    expect(
      cardPane({
        hasData: true,
        sync: 'card-behind',
        isFetching: false,
        isError: false,
        mounted: true,
      }),
    ).toEqual({ show: 'editor', refetch: true, refreshFailed: false });
  });
});

describe('R2: a failed background refetch keeps the editor and its text', () => {
  it('keeps the map on screen with a note when its refetch rejects', async () => {
    const qc = client();
    const key = recallKeys.map('m1');
    const fn = answers(map([entry, node()], 3));
    await qc.fetchQuery({ queryKey: key, queryFn: fn });
    await qc.fetchQuery({ queryKey: key, queryFn: fn, staleTime: 0 }).catch(() => undefined);
    const q = read<RecallMapDetailDTO>(qc, key);
    expect(q.isError).toBe(true);
    expect(q.data).toBeDefined(); // TanStack keeps the data on a failed refetch
    expect(detailPane(q)).toEqual({ show: 'ready', refreshFailed: true });
    expect(detailPane({ data: undefined, isError: true }).show).toBe('error');
  });

  it('keeps a mounted card editor when the card refetch rejects', async () => {
    const qc = client();
    const key = recallKeys.card('m1', 'fleet');
    const fn = answers(card());
    await qc.fetchQuery({ queryKey: key, queryFn: fn });
    await qc.fetchQuery({ queryKey: key, queryFn: fn, staleTime: 0 }).catch(() => undefined);
    const q = read<RecallCardDetailDTO>(qc, key);
    expect(q.isError).toBe(true);
    expect(
      cardPane({
        hasData: q.data !== undefined,
        sync: 'match',
        isFetching: false,
        isError: q.isError,
        mounted: true,
      }),
    ).toEqual({ show: 'editor', refetch: false, refreshFailed: true });
  });

  it('Publish with the card GET blocked: the edit moves up only because the map row confirms it', async () => {
    const qc = client();
    const mk = recallKeys.map('m1');
    const ck = recallKeys.card('m1', 'fleet');
    await qc.fetchQuery({ queryKey: mk, queryFn: answers(map([entry, node()], 3)) });
    await qc.fetchQuery({ queryKey: ck, queryFn: answers(card()) });
    // Publish (3 -> 4): the write hook carries the version, then invalidates.
    qc.setQueryData<RecallMapDetailDTO>(mk, (m) => (m ? { ...m, version: 4 } : m));
    await qc.invalidateQueries({ queryKey: mk, refetchType: 'none' });
    const mid = read<RecallMapDetailDTO>(qc, mk);
    expect(mid.isInvalidated).toBe(true); // not settled: the map rows are the old ones
    // The refetches land: the map's does, the card's is blocked.
    await qc.fetchQuery({
      queryKey: mk,
      queryFn: answers({ ...map([entry, node()], 4), published: true }),
      staleTime: 0,
    });
    await qc
      .fetchQuery({ queryKey: ck, queryFn: answers<RecallCardDetailDTO>(), staleTime: 0 })
      .catch(() => undefined);
    const m = read<RecallMapDetailDTO>(qc, mk);
    const c = read<RecallCardDetailDTO>(qc, ck);
    const settled = !m.isFetching && !c.isFetching && !m.isInvalidated;
    const sync = cardSync(m.data!.nodes[1]!, c.data!, {
      card: c.dataUpdatedAt,
      map: m.dataUpdatedAt,
    });
    expect(settled).toBe(true);
    expect(sync).toBe('match');
    expect(editorSync({ ...settledSync, dirty: true, mapState: 'own', sync, settled })).toEqual({
      move: 'version',
      conflict: null,
    });
    expect(
      cardPane({ hasData: true, sync, isFetching: false, isError: c.isError, mounted: true }),
    ).toEqual({
      show: 'editor',
      refetch: false,
      refreshFailed: true,
    });
  });

  it('never moves the version while the map refetch after a write has failed', async () => {
    const qc = client();
    const mk = recallKeys.map('m1');
    const fn = answers(map([entry, node()], 3));
    await qc.fetchQuery({ queryKey: mk, queryFn: fn });
    await qc.fetchQuery({ queryKey: mk, queryFn: fn, staleTime: 0 }).catch(() => undefined);
    expect(read(qc, mk).isInvalidated).toBe(true);
    expect(
      editorSync({ ...settledSync, dirty: true, mapState: 'own', settled: false }).move,
    ).toBeNull();
  });
});

describe('R3: a card deleted under a dirty edit stays open with its text', () => {
  it('holds the card open, marked gone, once the map drops it and the card GET 404s', async () => {
    const qc = client();
    const mk = recallKeys.map('m1');
    const ck = recallKeys.card('m1', 'fleet');
    const fleet = node();
    await qc.fetchQuery({ queryKey: mk, queryFn: answers(map([entry, fleet], 3)) });
    await qc.fetchQuery({ queryKey: ck, queryFn: answers(card()) });
    // Another tab deletes it; the stale save's refresh reloads both.
    await qc.fetchQuery({ queryKey: mk, queryFn: answers(map([entry], 4)), staleTime: 0 });
    await qc
      .fetchQuery({ queryKey: ck, queryFn: answers<RecallCardDetailDTO>(), staleTime: 0 })
      .catch(() => undefined);
    const nodes = read<RecallMapDetailDTO>(qc, mk).data!.nodes;

    // The editor held the card (dirty): it stays open, gone.
    expect(openCardOf(nodes, 'fleet', fleet)).toEqual({ node: fleet, gone: true });
    // Nothing held (a clean form): the pane falls back to the entry card.
    expect(openCardOf(nodes, 'fleet', null)).toEqual({ node: entry, gone: false });
    // The mounted editor stays mounted on the copy it has.
    const c = read<RecallCardDetailDTO>(qc, ck);
    expect(
      cardPane({
        hasData: c.data !== undefined,
        sync: 'match',
        isFetching: false,
        isError: c.isError,
        mounted: true,
      }).show,
    ).toBe('editor');
    // And neither follows nor claims a conflict while gone.
    expect(editorSync({ ...settledSync, dirty: true, gone: true, mapState: 'foreign' })).toEqual({
      move: null,
      conflict: null,
    });
  });

  it('opens the URL card, else the entry card, else the first', () => {
    const a = node({ slug: 'a' });
    expect(openCardOf([entry, a], 'a', null).node).toBe(a);
    expect(openCardOf([entry, a], null, null).node).toBe(entry);
    expect(openCardOf([a], 'zzz', null).node).toBe(a);
    expect(openCardOf([], null, null).node).toBeNull();
    // A held card for a different slug is not what the URL asks for.
    expect(openCardOf([entry], 'b', node({ slug: 'a' }))).toEqual({ node: entry, gone: false });
  });
});

describe('R6: a map rename under a dirty entry card is a card change', () => {
  it('does not move the version on the own write until the map and card are refetched', () => {
    expect(
      editorSync({ ...settledSync, dirty: true, mapState: 'own', settled: false }).move,
    ).toBeNull();
  });

  it('calls the retitled entry card changed once seen, and never moves the version', () => {
    const renamed = node({ slug: 'start', kind: 'index', title: 'Renamed' });
    const old = card({ slug: 'start', kind: 'index', title: 'Mantle' });
    // The map refetch landed first: the card copy is the older one.
    const sync = cardSync(renamed, old, { card: 1, map: 2 });
    expect(editorSync({ ...settledSync, dirty: true, mapState: 'own', sync })).toEqual({
      move: null,
      conflict: 'card',
    });
    // Then the card refetch lands with the new title.
    expect(editorSync({ ...settledSync, dirty: true, mapState: 'own', cardChanged: true })).toEqual(
      { move: null, conflict: 'card' },
    );
  });

  it('after the refusal, the title the owner did not touch takes the new one', () => {
    const oldBase = editsOf(card({ slug: 'start', kind: 'index', title: 'Mantle', bodyMd: 'a' }));
    const fresh = editsOf(card({ slug: 'start', kind: 'index', title: 'Renamed', bodyMd: 'a' }));
    const mine = { ...oldBase, bodyMd: 'my edit' };
    expect(rebaseEdits(mine, oldBase, fresh)).toEqual({ ...fresh, bodyMd: 'my edit' });
    // A title the owner did change stays theirs.
    const both = { ...oldBase, title: 'Mine', bodyMd: 'my edit' };
    expect(rebaseEdits(both, oldBase, fresh).title).toBe('Mine');
  });

  it('moves the version for an own write that left the card alone (publish, reorder)', () => {
    expect(editorSync({ ...settledSync, dirty: true, mapState: 'own' })).toEqual({
      move: 'version',
      conflict: null,
    });
    // Not when the card was written since (its stamp moved).
    expect(
      editorSync({ ...settledSync, dirty: true, mapState: 'own', sameStamp: false }).conflict,
    ).toBe('card');
  });
});

describe('R4: the default map is pinned into the URL', () => {
  it('pins only when the URL names none and the screen knows its pick', () => {
    expect(mapToPin(null, 'm1', true)).toBe('m1');
    expect(mapToPin('m2', 'm2', true)).toBeNull();
    expect(mapToPin(null, 'm1', false)).toBeNull();
    expect(mapToPin(null, null, true)).toBeNull();
  });
});

describe('R5: guarded navigation', () => {
  it('hands a navigation to the registered hold, and runs it when none is', () => {
    const ran: string[] = [];
    guardedNavigate(() => ran.push('free'));
    const held: (() => void)[] = [];
    const release = setNavHold((go) => held.push(go));
    guardedNavigate(() => ran.push('held'));
    expect(ran).toEqual(['free']);
    held[0]!();
    expect(ran).toEqual(['free', 'held']);
    release();
    guardedNavigate(() => ran.push('after'));
    expect(ran).toEqual(['free', 'held', 'after']);
  });

  it('ignores the release of a hold another screen replaced', () => {
    const first = setNavHold(() => undefined);
    const held: string[] = [];
    const second = setNavHold(() => held.push('second'));
    first();
    guardedNavigate(() => undefined);
    expect(held).toEqual(['second']);
    second();
  });
});
