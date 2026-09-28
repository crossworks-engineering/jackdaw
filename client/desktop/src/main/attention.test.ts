import { describe, expect, it } from 'vitest';
import { attentionMode, safeInAppPath } from './attention';

describe('safeInAppPath', () => {
  it('passes an in-app path with its query', () => {
    expect(safeInAppPath('/team-admin?view=review&item=abc')).toBe(
      '/team-admin?view=review&item=abc',
    );
  });
  it('refuses anything that could leave the app', () => {
    for (const bad of [
      '//evil.example/x',
      'https://evil.example',
      'team-admin',
      '/\\evil',
      '/a\nb',
      '',
      '/'.repeat(501),
      42,
      null,
    ]) {
      expect(safeInAppPath(bad)).toBeNull();
    }
  });
});

describe('attentionMode', () => {
  it('asks nothing of a focused window', () => {
    expect(attentionMode('darwin', true)).toBeNull();
    expect(attentionMode('linux', true)).toBeNull();
  });
  it('bounces the dock on macOS and flashes the taskbar elsewhere', () => {
    expect(attentionMode('darwin', false)).toBe('bounce');
    expect(attentionMode('linux', false)).toBe('flash');
  });
});
