/**
 * The one characters-to-tokens estimate the UI shows. An estimate only: the
 * provider's tokenizer decides the real count, and tokenizers differ by 10 to
 * 20% on the same text.
 */

/** English prose: about 4 characters per token, the standard heuristic. */
export const PROSE_CHARS_PER_TOKEN = 4;

/** The corpus map (the per-turn "what exists" overview) is ids, counts and
 *  short titles, which split into more tokens per character than prose.
 *  Measured on the dev brain (Grok tokenizer, same probe questions): shrinking
 *  the map from 23,904 to 6,463 characters took 5,288 tokens off round 0, 3.30
 *  characters per token; the old map alone was 24,170 characters for 7.6k
 *  tokens, 3.18. Prose on the same brain measured 3.9. */
export const CORPUS_MAP_CHARS_PER_TOKEN = 3.3;

/** Estimated tokens for `chars` characters, at least 1 for non-empty text. */
export function estimateTokens(chars: number, charsPerToken = PROSE_CHARS_PER_TOKEN): number {
  if (chars <= 0) return 0;
  return Math.max(1, Math.round(chars / charsPerToken));
}
