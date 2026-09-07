import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps in-app paths, query and hash included', () => {
    expect(safeNext('/')).toBe('/');
    expect(safeNext('/tasks')).toBe('/tasks');
    expect(safeNext('/pages/abc?tab=2#top')).toBe('/pages/abc?tab=2#top');
  });

  it('refuses absolute and scheme-relative URLs', () => {
    expect(safeNext('https://evil.example')).toBeUndefined();
    expect(safeNext('http://evil.example/tasks')).toBeUndefined();
    expect(safeNext('//evil.example')).toBeUndefined();
    expect(safeNext('/\\evil.example')).toBeUndefined();
    expect(safeNext('javascript:alert(1)')).toBeUndefined();
  });

  it('refuses anything that is not a string or not a path', () => {
    expect(safeNext(undefined)).toBeUndefined();
    expect(safeNext(null)).toBeUndefined();
    expect(safeNext('')).toBeUndefined();
    expect(safeNext('tasks')).toBeUndefined();
  });
});
