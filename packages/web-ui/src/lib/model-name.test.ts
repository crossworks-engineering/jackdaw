import { describe, expect, it } from 'vitest';
import { shortModelName } from './model-name';

describe('shortModelName', () => {
  it('names Claude models by family and version', () => {
    expect(shortModelName('anthropic/claude-sonnet-5-5')).toBe('Sonnet 5.5');
    expect(shortModelName('anthropic/claude-sonnet-4.5')).toBe('Sonnet 4.5');
    expect(shortModelName('claude-opus-5-5')).toBe('Opus 5.5');
    expect(shortModelName('claude-fable-5-1')).toBe('Fable 5.1');
    expect(shortModelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    expect(shortModelName('anthropic/claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5');
    expect(shortModelName('~anthropic/claude-sonnet-latest')).toBe('Sonnet latest');
  });

  it('keeps other ids, without the provider, alias mark, variant or date', () => {
    expect(shortModelName('x-ai/grok-latest')).toBe('grok-latest');
    expect(shortModelName('openrouter/x-ai/grok-4.3')).toBe('grok-4.3');
    expect(shortModelName('google/gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(shortModelName('meta-llama/llama-4-maverick:free')).toBe('llama-4-maverick');
    expect(shortModelName('openai/gpt-5-2025-08-07')).toBe('gpt-5');
    expect(shortModelName('gemma-3-27b')).toBe('gemma-3-27b');
  });

  it('is empty for nothing', () => {
    expect(shortModelName('')).toBe('');
    expect(shortModelName(null)).toBe('');
    expect(shortModelName(undefined)).toBe('');
  });
});
