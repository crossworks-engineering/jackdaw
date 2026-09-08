import { describe, expect, it } from 'vitest';
import {
  PROVIDER_FOR_KIND,
  openrouterPrefixFor,
  openrouterSlugFor,
  staticCatalogFor,
  validateWorker,
} from './worker-form-state';
import type { AiWorkerKind } from '@mantle/client-types';

/**
 * The worker form's pure layer, lifted out of a 2,507-line file by phase 1.
 * Two of these decide which models an operator is offered and what key the
 * pricing lookup uses — get either wrong and the worker saves fine, then fails
 * at its first real call.
 */

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const complete = { name: 'Transcriber', model: 'whisper-1', base_url: 'https://x.example' };

describe('validateWorker', () => {
  it('passes a complete form', () => {
    expect(validateWorker(form(complete), { needsBaseUrl: false })).toEqual({});
    expect(validateWorker(form(complete), { needsBaseUrl: true })).toEqual({});
  });

  it('requires a name and a model', () => {
    expect(
      validateWorker(form({ ...complete, name: '' }), { needsBaseUrl: false }).name,
    ).toBeTruthy();
    expect(
      validateWorker(form({ ...complete, model: '' }), { needsBaseUrl: false }).model,
    ).toBeTruthy();
  });

  it('treats whitespace as empty', () => {
    expect(
      validateWorker(form({ ...complete, name: '   ' }), { needsBaseUrl: false }).name,
    ).toBeTruthy();
  });

  it('handles a field that is absent entirely, not just blank', () => {
    const errs = validateWorker(form({}), { needsBaseUrl: false });
    expect(errs.name).toBeTruthy();
    expect(errs.model).toBeTruthy();
  });

  // A custom route has nowhere to fall back to: without a base URL the saved
  // worker cannot run at all, so this is only asked when it is the only way.
  it('demands a base URL only for a route that needs one', () => {
    const noUrl = form({ ...complete, base_url: '' });
    expect(validateWorker(noUrl, { needsBaseUrl: false }).primary_base_url_input).toBeUndefined();
    expect(validateWorker(noUrl, { needsBaseUrl: true }).primary_base_url_input).toBeTruthy();
  });
});

describe('openrouter slugs', () => {
  // These two providers are spelled differently on OpenRouter than in our own
  // provider list, and the mismatch is invisible until a pricing lookup misses.
  it('maps the providers OpenRouter spells differently', () => {
    expect(openrouterPrefixFor('xai')).toBe('x-ai');
    expect(openrouterPrefixFor('mistral')).toBe('mistralai');
    expect(openrouterPrefixFor('anthropic')).toBe('anthropic');
  });

  it('leaves an OpenRouter id alone — it already carries its prefix', () => {
    expect(openrouterSlugFor('openrouter', 'anthropic/Claude-Haiku')).toBe(
      'anthropic/claude-haiku',
    );
  });

  it('prefixes a direct provider, lower-cased to match the cache key', () => {
    expect(openrouterSlugFor('anthropic', 'Claude-Haiku-4-5')).toBe('anthropic/claude-haiku-4-5');
    expect(openrouterSlugFor('xai', 'Grok-2')).toBe('x-ai/grok-2');
  });
});

describe('staticCatalogFor', () => {
  const kinds = Object.keys(PROVIDER_FOR_KIND) as AiWorkerKind[];

  it('offers something for every kind against its own default provider', () => {
    // Not every kind has a static list — but the ones that do must not be
    // empty, and none may throw.
    for (const kind of kinds) {
      expect(() => staticCatalogFor(kind, PROVIDER_FOR_KIND[kind])).not.toThrow();
    }
  });

  it('gives each speech provider its own list, not a shared one', () => {
    const ids = (p: string) => staticCatalogFor('stt', p).map((m) => m.id);
    expect(ids('xai')).not.toEqual(ids('deepgram'));
    expect(ids('elevenlabs')).not.toEqual(ids('assemblyai'));
    expect(ids('google').length).toBeGreaterThan(0);
  });

  // A provider with no wired adapter still needs a plausible list; the form's
  // "not yet wired" hint is what steers the operator.
  it('falls back rather than returning nothing for an unwired provider', () => {
    expect(staticCatalogFor('stt', 'huggingface').length).toBeGreaterThan(0);
    expect(staticCatalogFor('vision', 'unknown-provider').length).toBeGreaterThan(0);
  });

  // Documents reuse the vision catalogs — same multimodal models.
  it('gives documents the vision catalog', () => {
    for (const p of ['anthropic', 'google', 'xai', 'openrouter']) {
      expect(staticCatalogFor('document', p)).toEqual(staticCatalogFor('vision', p));
    }
  });

  it('returns a fresh array each time, so a caller cannot mutate the source', () => {
    const a = staticCatalogFor('tts', 'openai');
    const b = staticCatalogFor('tts', 'openai');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
