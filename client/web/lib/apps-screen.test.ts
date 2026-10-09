import { describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@mantle/web-ui/api-fetch', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import {
  APP_DELETE_CONFIRM,
  APP_DELETED_TOAST,
  appDetailQuery,
  appsLegacyHref,
  appsUrlId,
  appsUrlSelection,
  selectionParams,
} from './apps-screen';

const sp = (s: string) => new URLSearchParams(s);

describe('appsLegacyHref', () => {
  it('leaves a current URL alone', () => {
    expect(appsLegacyHref(sp(''), true)).toBeNull();
    expect(appsLegacyHref(sp('q=weather&id=a1'), true)).toBeNull();
    // The paged list (a brain before the tree) still pages.
    expect(appsLegacyHref(sp('page=2&q=x'), false)).toBeNull();
  });

  it('drops the paged list params the tree does not read', () => {
    expect(appsLegacyHref(sp('page=3&sort=title'), true)).toBe('/apps');
    expect(appsLegacyHref(sp('page=3&sort=title&q=weather'), true)).toBe('/apps?q=weather');
  });

  it('drops sort on the paged list too, and keeps its page', () => {
    expect(appsLegacyHref(sp('page=2&sort=newest'), false)).toBe('/apps?page=2');
  });

  it('reads ?selected= as ?id=', () => {
    expect(appsLegacyHref(sp('selected=a1'), true)).toBe('/apps?id=a1');
    // An explicit id wins.
    expect(appsLegacyHref(sp('selected=a1&id=b2'), true)).toBe('/apps?id=b2');
  });
});

describe('appsUrlId', () => {
  it('takes ?id=, then ?selected=, else null', () => {
    expect(appsUrlId(sp('id=a1&selected=b2'))).toBe('a1');
    expect(appsUrlId(sp('selected=b2'))).toBe('b2');
    expect(appsUrlId(sp('id=%20'))).toBeNull();
    expect(appsUrlId(sp(''))).toBeNull();
  });
});

describe('copy', () => {
  it('has no em or en dashes', () => {
    for (const s of [APP_DELETE_CONFIRM, APP_DELETED_TOAST]) expect(s).not.toMatch(/[–—]/);
  });
});

describe('appDetailQuery', () => {
  // The /apps pane and the app's own screen share `['apps', id]`. The pane
  // once cached the bare app there, and Open crashed reading `data.app`.
  it('caches the route answer as it is, `{ app }`, at one key', async () => {
    const app = {
      id: 'a1',
      title: 'Weather',
      manifest: {},
      source: { entry: 'App.tsx', files: {} },
    };
    apiFetch.mockResolvedValueOnce({ app });
    const q = appDetailQuery('a1');
    expect(q.queryKey).toEqual(['apps', 'a1']);
    expect(apiFetch).not.toHaveBeenCalled();
    const data = await q.queryFn();
    expect(apiFetch).toHaveBeenCalledWith('/api/apps/a1');
    expect(data).toEqual({ app });
    expect(data.app.id).toBe('a1');
  });
});

describe('the pane selection in the URL', () => {
  it('reads ?review= first, then ?id= and ?selected=', () => {
    expect(appsUrlSelection(sp('review=m1&id=a1'))).toEqual({ kind: 'review', id: 'm1' });
    expect(appsUrlSelection(sp('id=a1'))).toEqual({ kind: 'app', id: 'a1' });
    expect(appsUrlSelection(sp('selected=a1'))).toEqual({ kind: 'app', id: 'a1' });
    expect(appsUrlSelection(sp('review=%20'))).toBeNull();
  });

  it('writes one param and clears the other', () => {
    expect(selectionParams({ kind: 'review', id: 'm1' })).toEqual({ id: null, review: 'm1' });
    expect(selectionParams({ kind: 'app', id: 'a1' })).toEqual({ id: 'a1', review: null });
    expect(selectionParams(null)).toEqual({ id: null, review: null });
  });
});
