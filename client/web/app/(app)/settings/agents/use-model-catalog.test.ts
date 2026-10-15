import { describe, expect, it } from 'vitest';
import {
  NEEDS_KEY_MESSAGE,
  UNSUPPORTED_MESSAGE,
  catalogFromError,
  catalogFromResponse,
  catalogKeyId,
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

  // The picked key decides the list: a key saved under a label other than
  // `default` listed nothing when the brain looked the provider key up itself.
  it('names the picked key, and leaves it out when none is picked', () => {
    expect(catalogUrl('anthropic', 'k-1')).toBe('/api/models?provider=anthropic&keyId=k-1');
    expect(catalogUrl('anthropic', null)).toBe('/api/models?provider=anthropic');
    expect(catalogUrl(undefined, 'k 2')).toBe('/api/models?provider=openrouter&keyId=k%202');
  });
});

describe('catalogKeyId', () => {
  const keys = [
    { id: 'ant', service: 'anthropic' },
    { id: 'or', service: 'openrouter' },
  ];

  it("sends the picked key only when it is the provider's", () => {
    expect(catalogKeyId(keys, 'ant', 'anthropic')).toBe('ant');
    // The form keeps the key while the provider changes; the brain would
    // refuse the pair, so it is not sent.
    expect(catalogKeyId(keys, 'ant', 'openai')).toBeNull();
    expect(catalogKeyId(keys, 'or', '')).toBe('or');
  });

  it('sends nothing for no pick or a key no longer on file', () => {
    expect(catalogKeyId(keys, '', 'anthropic')).toBeNull();
    expect(catalogKeyId(keys, null, 'anthropic')).toBeNull();
    expect(catalogKeyId(keys, 'gone', 'anthropic')).toBeNull();
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

  // An empty list says why: it was a silent empty picker for a new key.
  it('says no key is saved when the brain answers needsKey', () => {
    const c = catalogFromResponse({ models: [], needsKey: true });
    expect(c.models).toEqual([]);
    expect(c.error).toBe(NEEDS_KEY_MESSAGE);
  });

  it("shows the brain's text for a refused key", () => {
    const text = 'The provider refused the API key. (anthropic, HTTP 401)';
    expect(catalogFromResponse({ models: [], error: text }).error).toBe(text);
  });

  it('says so for a provider with no list API', () => {
    expect(catalogFromResponse({ models: [], unsupported: true }).error).toBe(UNSUPPORTED_MESSAGE);
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
    // A refused pick (400 / 404) reaches the list as the brain's own words.
    expect(catalogFromError(new Error('That key is for openai, not anthropic.')).error).toBe(
      'That key is for openai, not anthropic.',
    );
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
