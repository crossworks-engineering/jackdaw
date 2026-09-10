import { describe, expect, it } from 'vitest';

import { micUnavailableReason, pickRecorderMimeType } from './use-voice-input';

/**
 * The two decisions inside voice capture that are not about React. Both fail
 * quietly: the wrong container yields a recording the STT adapter cannot read,
 * and an unreachable mic surfaces as a TypeError from deep inside a browser API
 * rather than as something a user can act on.
 */

describe('pickRecorderMimeType', () => {
  const supports =
    (...types: string[]) =>
    (t: string) =>
      types.includes(t);

  it('prefers webm/opus, the most portable target', () => {
    expect(pickRecorderMimeType(supports('audio/webm;codecs=opus', 'audio/webm'))).toBe(
      'audio/webm;codecs=opus',
    );
  });

  it('falls back to plain webm when opus is not offered', () => {
    expect(pickRecorderMimeType(supports('audio/webm'))).toBe('audio/webm');
  });

  it('lets the browser choose when it supports neither', () => {
    // Safari: the empty string means "no mimeType option", and it lands on
    // mp4/aac, which the STT adapters also accept. Passing an unsupported type
    // instead would throw at construction.
    expect(pickRecorderMimeType(supports())).toBe('');
  });

  it('asks in priority order and stops at the first match', () => {
    const asked: string[] = [];
    pickRecorderMimeType((t) => {
      asked.push(t);
      return t === 'audio/webm;codecs=opus';
    });
    expect(asked).toEqual(['audio/webm;codecs=opus']);
  });
});

describe('micUnavailableReason', () => {
  it('passes a browser that can reach the mic', () => {
    expect(micUnavailableReason({ getUserMedia: () => {} })).toBeNull();
  });

  it('explains the insecure-origin block rather than throwing later', () => {
    // Browsers hard-block getUserMedia on plain HTTP with no fallback, and
    // `mediaDevices` itself is absent — so the naive call is a TypeError.
    expect(micUnavailableReason(undefined)).toMatch(/HTTPS/);
  });

  it('also covers a mediaDevices without getUserMedia', () => {
    expect(micUnavailableReason({})).toMatch(/HTTPS/);
  });
});
