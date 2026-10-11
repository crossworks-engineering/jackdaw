import { describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@mantle/web-ui/api-fetch', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import {
  APP_DELETE_CONFIRM,
  APP_DELETED_TOAST,
  APP_WAS_IN_TRASH,
  MEMBER_APP_DELETE_CONFIRM,
  MEMBER_APP_DELETED_TOAST,
  appDetailQuery,
  wasInTrash,
  appsLegacyHref,
  appsUrlId,
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

  it('drops an old member app review link (its review param, gone in W5c)', () => {
    expect(appsLegacyHref(sp('review=m1'), true)).toBe('/apps');
    expect(appsLegacyHref(sp('review=m1&id=a1'), false)).toBe('/apps?id=a1');
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
    for (const s of [
      APP_DELETE_CONFIRM,
      APP_DELETED_TOAST,
      MEMBER_APP_DELETE_CONFIRM,
      MEMBER_APP_DELETED_TOAST,
      APP_WAS_IN_TRASH,
    ])
      expect(s).not.toMatch(/[–—]/);
  });

  it('a member delete: the trash, only the owner deletes it for good, no days (W6b fix round)', () => {
    for (const s of [MEMBER_APP_DELETE_CONFIRM, MEMBER_APP_DELETED_TOAST]) {
      expect(s).not.toMatch(/\bdays?\b|purge|Recently deleted|An Admin user can restore/i);
      expect(s).toMatch(/trash/);
      expect(s).toMatch(/Only the brain owner can delete it for good\./);
    }
  });
});

describe('wasInTrash (W6b)', () => {
  it('is true only when the brain marks the app', () => {
    expect(wasInTrash({ trashedBeforeFold: true })).toBe(true);
    expect(wasInTrash({ trashedBeforeFold: false })).toBe(false);
    expect(wasInTrash({ trashedBeforeFold: 'true' })).toBe(false);
    expect(wasInTrash({})).toBe(false);
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
