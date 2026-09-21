import { describe, expect, it } from 'vitest';
import { sameBrainAddress } from './brain-address';

const HERE = 'https://brain.example';

describe('sameBrainAddress', () => {
  it('is forgiving about how people type the address of THIS brain', () => {
    for (const typed of [
      'https://brain.example',
      '  https://brain.example/  ',
      'https://brain.example/pages/123?x=1',
      'HTTPS://Brain.Example',
      'brain.example',
      'brain.example/',
      'https://brain.example:443',
    ]) {
      expect(sameBrainAddress(typed, HERE), typed).toBe(true);
    }
  });

  it('tells another brain apart, including by scheme and port', () => {
    for (const typed of [
      'https://other.example',
      'http://brain.example',
      'https://brain.example:8443',
      'https://sub.brain.example',
      'other.example',
    ]) {
      expect(sameBrainAddress(typed, HERE), typed).toBe(false);
    }
  });

  it('treats anything it cannot read as NOT this brain, so the shell gets to explain', () => {
    for (const typed of [
      '',
      '   ',
      'not a url at all',
      'ftp://brain.example',
      'javascript:alert(1)',
    ]) {
      expect(sameBrainAddress(typed, HERE), typed).toBe(false);
    }
  });

  it('a local brain on http keeps its scheme', () => {
    expect(sameBrainAddress('http://localhost:3000', 'http://localhost:3000')).toBe(true);
    expect(sameBrainAddress('localhost:3000', 'http://localhost:3000')).toBe(false);
  });
});
