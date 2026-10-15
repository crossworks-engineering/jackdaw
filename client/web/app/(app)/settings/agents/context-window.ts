import type { ExplorerModel } from '@mantle/client-types';
import { resolveProvider } from './use-model-catalog';

/**
 * What the Model field says about the picked model's context window.
 *
 * Two sources, the provider's own first:
 *  - the provider's model list (`/api/models?provider=`): a direct provider's
 *    row carries `contextTokens` when the brain knows it (Anthropic's own
 *    `max_input_tokens`, else the OpenRouter window for that model's
 *    OpenRouter id; an older brain sends none for Anthropic);
 *  - the OpenRouter map (`/api/model-context`), keyed by OpenRouter slug,
 *    which only matches a direct id when the two are spelled alike.
 *
 * `unknown` says whether the OpenRouter hint fits: only an OpenRouter slug
 * can be looked up at openrouter.ai/models; a direct id (`claude-opus-4-8`)
 * never matches there, so pointing at it was wrong.
 */
export type ContextWindow =
  { kind: 'known'; limit: number } | { kind: 'unknown'; openRouterSlug: boolean } | null;

export function resolveContextWindow(input: {
  provider: string | null | undefined;
  model: string;
  limits: Record<string, number>;
  catalog: readonly ExplorerModel[];
}): ContextWindow {
  const slug = input.model.trim().toLowerCase();
  if (!slug) return null;
  const fromProvider = input.catalog.find((m) => m.id.toLowerCase() === slug)?.contextTokens;
  if (fromProvider && fromProvider > 0) return { kind: 'known', limit: fromProvider };
  const fromMap = input.limits[slug];
  if (fromMap && fromMap > 0) return { kind: 'known', limit: fromMap };
  return { kind: 'unknown', openRouterSlug: resolveProvider(input.provider) === 'openrouter' };
}

/** 1M, 200k, 512: the short form the hint shows. */
export function prettyTokens(limit: number): string {
  if (limit >= 1_000_000) {
    return `${(limit / 1_000_000).toFixed(limit % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (limit >= 1_000) return `${Math.round(limit / 1_000)}k`;
  return `${limit}`;
}
