import { describe, expect, it } from 'vitest';
import { prettyTokens, resolveContextWindow } from './context-window';

const LIMITS = { 'anthropic/claude-opus-4.7': 1_000_000 };

describe('resolveContextWindow', () => {
  it('says nothing until a model is picked', () => {
    expect(
      resolveContextWindow({ provider: 'anthropic', model: ' ', limits: LIMITS, catalog: [] }),
    ).toBeNull();
  });

  it("reads a direct model's window from the provider's own list first", () => {
    expect(
      resolveContextWindow({
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        limits: LIMITS,
        catalog: [{ id: 'claude-opus-4-7', contextTokens: 200_000, raw: {} }],
      }),
    ).toEqual({ kind: 'known', limit: 200_000 });
  });

  it('falls back to the OpenRouter map for an OpenRouter slug', () => {
    expect(
      resolveContextWindow({
        provider: 'openrouter',
        model: 'Anthropic/Claude-Opus-4.7',
        limits: LIMITS,
        catalog: [],
      }),
    ).toEqual({ kind: 'known', limit: 1_000_000 });
  });

  it('points at OpenRouter only for an OpenRouter slug', () => {
    expect(
      resolveContextWindow({
        provider: 'anthropic',
        model: 'claude-x',
        limits: LIMITS,
        catalog: [],
      }),
    ).toEqual({ kind: 'unknown', openRouterSlug: false });
    // An older brain's direct row has no window: still not an OpenRouter hint.
    expect(
      resolveContextWindow({
        provider: 'anthropic',
        model: 'claude-x',
        limits: LIMITS,
        catalog: [{ id: 'claude-x', raw: {} }],
      }),
    ).toEqual({ kind: 'unknown', openRouterSlug: false });
    expect(
      resolveContextWindow({ provider: '', model: 'vendor/unknown', limits: LIMITS, catalog: [] }),
    ).toEqual({ kind: 'unknown', openRouterSlug: true });
  });
});

describe('prettyTokens', () => {
  it('shortens as before', () => {
    expect(prettyTokens(1_000_000)).toBe('1M');
    expect(prettyTokens(1_048_576)).toBe('1.0M');
    expect(prettyTokens(200_000)).toBe('200k');
    expect(prettyTokens(512)).toBe('512');
  });
});
