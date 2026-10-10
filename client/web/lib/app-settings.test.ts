import { describe, expect, it } from 'vitest';
import type { AppDetail } from '@mantle/client-types';
import { hasAppSettings } from './app-settings';

const app = (extra: Record<string, unknown>) =>
  ({ audience: 'admin', ...extra }) as unknown as AppDetail;

describe('hasAppSettings', () => {
  it('is false for an older brain that sends none of the flags', () => {
    expect(hasAppSettings(app({}))).toBe(false);
  });

  it('is false for Informational and MCP access alone: they live in the Access panel', () => {
    expect(hasAppSettings(app({ audience: 'team', dataReadOnly: false }))).toBe(false);
    expect(hasAppSettings(app({ mcpAccess: true }))).toBe(false);
  });

  it('is true when Trust its tools has something to say', () => {
    expect(hasAppSettings(app({ authorLevel: 'team' }))).toBe(true);
    expect(hasAppSettings(app({ authorLevel: 'admin', authorCeilingSeen: true }))).toBe(true);
  });
});
