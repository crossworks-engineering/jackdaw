import { describe, expect, it } from 'vitest';
import { requestsOpen } from './needs-you';

describe('needs-you, kept for Team admin until it goes (W5c)', () => {
  it('reads no count when there is no answer', () => {
    expect(requestsOpen(null)).toBe(0);
    expect(requestsOpen(undefined)).toBe(0);
  });
});
