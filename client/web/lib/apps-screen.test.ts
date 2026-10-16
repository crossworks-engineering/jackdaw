import { describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@mantle/web-ui/api-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mantle/web-ui/api-fetch')>()),
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}));
const { ApiError } = await import('@mantle/web-ui/api-fetch');

import {
  APP_CODE_MANAGE_TEXT,
  APP_DELETE_CONFIRM,
  appCodeErrorText,
  canChangeAppCode,
  APP_DELETED_TOAST,
  APP_WAS_IN_TRASH,
  HELD_APP_DELETE_CONFIRM,
  HELD_APP_DELETED_TOAST,
  appDeleteCopy,
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
      HELD_APP_DELETE_CONFIRM,
      HELD_APP_DELETED_TOAST,
      APP_WAS_IN_TRASH,
    ])
      expect(s).not.toMatch(/[–—]/);
  });

  it('a delete by anyone but the owner: kept in the trash until the owner deletes it, no days (W6b fix round 2)', () => {
    for (const s of [HELD_APP_DELETE_CONFIRM, HELD_APP_DELETED_TOAST]) {
      expect(s).not.toMatch(/\bdays?\b|\d|purge|Recently deleted|An Admin user can restore/i);
      expect(s).toMatch(/trash/);
      expect(s).toMatch(/until the brain owner deletes it for good\.$/);
    }
  });

  it('the owner delete: the trash for 30 days', () => {
    for (const s of [APP_DELETE_CONFIRM, APP_DELETED_TOAST]) expect(s).toMatch(/30 days/);
  });
});

describe('appDeleteCopy (W6b fix round 2)', () => {
  it('gives the 30-day text to the brain owner only', () => {
    expect(appDeleteCopy(true)).toEqual({ confirm: APP_DELETE_CONFIRM, toast: APP_DELETED_TOAST });
  });

  it('gives the held text to any other login, an Admin user too', () => {
    expect(appDeleteCopy(false)).toEqual({
      confirm: HELD_APP_DELETE_CONFIRM,
      toast: HELD_APP_DELETED_TOAST,
    });
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

// Brain F4: the draft, the build and the commit need the app's manage right.
describe('canChangeAppCode', () => {
  it('needs both edit and manage', () => {
    expect(canChangeAppCode({ mayEdit: true, mayManage: true })).toBe(true);
    expect(canChangeAppCode({ mayEdit: true, mayManage: false })).toBe(false);
    expect(canChangeAppCode({ mayEdit: false, mayManage: true })).toBe(false);
  });

  it('a brain that sends no caps leaves it on (the brain still decides)', () => {
    expect(canChangeAppCode({})).toBe(true);
    expect(canChangeAppCode(null)).toBe(true);
  });
});

describe('appCodeErrorText', () => {
  it('says a 403 in plain words, never the raw answer', () => {
    const e = new ApiError('You cannot change this item in your workspaces.', 403, {
      error: 'You cannot change this item in your workspaces.',
      code: 'item-workspace',
    });
    expect(appCodeErrorText(e, 'Commit failed.')).toBe(APP_CODE_MANAGE_TEXT);
  });

  it("keeps the brain's own words for anything else, else the fallback", () => {
    expect(appCodeErrorText(new ApiError('Draft too large', 413), 'Could not save.')).toBe(
      'Draft too large',
    );
    expect(appCodeErrorText('boom', 'Could not save.')).toBe('Could not save.');
  });

  it('the reason has no em or en dashes', () => {
    expect(APP_CODE_MANAGE_TEXT).not.toMatch(/[\u2013\u2014]/);
  });
});
