import { describe, expect, it } from 'vitest';
import { CORPUS_MAP_CHARS_PER_TOKEN, estimateTokens } from './token-estimate';

describe('estimateTokens', () => {
  it('uses about 4 characters per token for prose', () => {
    expect(estimateTokens(4_000)).toBe(1_000);
  });

  it('uses the measured 3.3 for the corpus map: the 6,500 default is about 2k tokens', () => {
    expect(estimateTokens(6_500, CORPUS_MAP_CHARS_PER_TOKEN)).toBe(1_970);
  });

  it('is 0 for nothing and at least 1 for any text', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
  });
});
