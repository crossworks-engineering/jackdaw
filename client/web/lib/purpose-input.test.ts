import { describe, expect, it } from 'vitest';
import { PURPOSE_MAX_CHARS, checkPurpose, looksLikePersonaPrompt } from './purpose-input';

describe('checkPurpose', () => {
  it('measures the trimmed text, like the server', () => {
    const c = checkPurpose(`  ${'a'.repeat(PURPOSE_MAX_CHARS)}  `);
    expect(c.length).toBe(PURPOSE_MAX_CHARS);
    expect(c.over).toBe(false);
  });

  it('flags one character past the limit', () => {
    expect(checkPurpose('a'.repeat(PURPOSE_MAX_CHARS + 1)).over).toBe(true);
  });

  it('passes a normal one-sentence purpose with no hint', () => {
    const c = checkPurpose(
      'Analyse inspection reports and answer questions about asset integrity for a refinery.',
    );
    expect(c).toMatchObject({ over: false, looksLikePersona: false });
  });

  it('catches the 2026-09-28 paste: long, "You are", markdown headings', () => {
    const paste = `You are Saskia, a warm assistant.\n\n## Tone\n${'Be kind. '.repeat(430)}`;
    const c = checkPurpose(paste);
    expect(c.over).toBe(true);
    expect(c.looksLikePersona).toBe(true);
  });
});

describe('looksLikePersonaPrompt', () => {
  it.each([
    'You are a helpful assistant.',
    "you're my research aide",
    'Act as a senior engineer.',
    'Your name is Rea.',
    'Helps the team.\n\n# Personality\nFriendly.',
  ])('flags %j', (text) => {
    expect(looksLikePersonaPrompt(text)).toBe(true);
  });

  it.each([
    '',
    'A personal brain for family admin, church rosters and home projects.',
    'Research notes where you are the main reader.',
    'Tracks #hashtags from our socials.',
  ])('does not flag %j', (text) => {
    expect(looksLikePersonaPrompt(text)).toBe(false);
  });

  it('flags a long paste even without other signs', () => {
    expect(looksLikePersonaPrompt('word '.repeat(100))).toBe(true);
  });
});
