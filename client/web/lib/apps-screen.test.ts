import { describe, expect, it } from 'vitest';
import { APP_DELETE_CONFIRM, APP_DELETED_TOAST, appsLegacyHref, appsUrlId } from './apps-screen';

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
