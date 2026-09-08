import { describe, expect, it } from 'vitest';
import {
  catalogFromError,
  catalogFromResponse,
  catalogUrl,
  resolveProvider,
} from './use-model-catalog';
import type { ExplorerModel } from '@mantle/client-types';

/**
 * The model catalog's decisions, which were written out twice before this and
 * could not be tested at all. Getting them wrong is not cosmetic: a wrong
 * catalog means an operator saves a slug for the wrong provider, and it 404s
 * at the first turn rather than at save time.
 */

const model = (id: string) => ({ id }) as unknown as ExplorerModel;

describe('resolveProvider', () => {
  it('falls back to the provider that always answers', () => {
    expect(resolveProvider(undefined)).toBe('openrouter');
    expect(resolveProvider(null)).toBe('openrouter');
    expect(resolveProvider('')).toBe('openrouter');
    expect(resolveProvider('anthropic')).toBe('anthropic');
  });
});

describe('catalogUrl', () => {
  it('encodes the provider', () => {
    expect(catalogUrl('anthropic')).toBe('/api/models?provider=anthropic');
    expect(catalogUrl('a b&c')).toContain('provider=a%20b%26c');
  });
});

describe('catalogFromResponse', () => {
  it('takes the models and settles', () => {
    const c = catalogFromResponse({ models: [model('x')] });
    expect(c.models).toHaveLength(1);
    expect(c.loading).toBe(false);
    expect(c.error).toBeNull();
  });

  // A provider that answered partially still lists what it has, and the note
  // says why the rest is missing — so error is NOT the inverse of models.
  it('keeps both the models and the error when a provider answers partially', () => {
    const c = catalogFromResponse({ models: [model('x')], error: 'rate limited' });
    expect(c.models).toHaveLength(1);
    expect(c.error).toBe('rate limited');
  });

  it('reports the provider error when nothing came back', () => {
    expect(catalogFromResponse({ error: 'no key' }).error).toBe('no key');
  });

  it('says so when the answer had no catalog in it at all', () => {
    expect(catalogFromResponse({}).error).toBe('No catalog returned');
    expect(catalogFromResponse({ models: undefined }).error).toBe('No catalog returned');
    // A malformed answer must not be treated as an empty catalog.
    expect(catalogFromResponse({ models: 'nope' as unknown as ExplorerModel[] }).error).toBe(
      'No catalog returned',
    );
  });

  it('always settles the loading flag', () => {
    expect(catalogFromResponse({}).loading).toBe(false);
    expect(catalogFromResponse({ models: [] }).loading).toBe(false);
  });
});

describe('catalogFromError', () => {
  it('surfaces the message a thrown Error carries', () => {
    expect(catalogFromError(new Error('offline')).error).toBe('offline');
  });

  it('has something to say about a throw that is not an Error', () => {
    expect(catalogFromError('boom').error).toBe('Catalog fetch failed');
    expect(catalogFromError(undefined).error).toBe('Catalog fetch failed');
  });

  it('settles and empties', () => {
    const c = catalogFromError(new Error('x'));
    expect(c.loading).toBe(false);
    expect(c.models).toEqual([]);
  });
});
