import { afterEach, describe, expect, it } from 'vitest';
import { rewritePath, setPathRewrite } from './api-fetch';

afterEach(() => setPathRewrite(null));

describe('the path rewrite apiFetch runs', () => {
  it('sends the path unchanged with none registered', () => {
    expect(rewritePath('/api/pages', 'POST')).toBe('/api/pages');
  });

  it('runs the registered rewrite with the method in capitals', () => {
    setPathRewrite((p, m) => `${p}#${m}`);
    expect(rewritePath('/api/pages', 'post')).toBe('/api/pages#POST');
    expect(rewritePath('/api/pages')).toBe('/api/pages#GET');
  });
});
