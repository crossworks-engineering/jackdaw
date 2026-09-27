import { describe as suite, expect, it } from 'vitest';
import { describe } from './access-log';

suite('access log row words', () => {
  it('a member opened the app; a team-link visitor entered a token', () => {
    expect(describe({ kind: 'auth', detail: { via: 'member' } }).label).toBe('Opened the app');
    expect(describe({ kind: 'auth', detail: {} }).label).toBe('Entered their team token');
  });

  it('marks refused member calls', () => {
    expect(
      describe({ kind: 'tool', detail: { via: 'member', slug: 'x', refused: 'not-declared' } })
        .label,
    ).toBe('Used tool x (refused)');
    expect(
      describe({ kind: 'db', detail: { via: 'member', op: 'exec', refused: 'read-only' } }).label,
    ).toBe('Wrote to the app database (refused)');
    expect(describe({ kind: 'db', detail: { op: 'query' } }).label).toBe(
      'Queried the app database',
    );
  });
});
