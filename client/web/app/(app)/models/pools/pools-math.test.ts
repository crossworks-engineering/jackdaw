import { describe, expect, it } from 'vitest';
import { blendedPerM, comparisonRows, fmtMTokens, fmtPerM, type PoolEntry } from './pools-math';

const entry = (id: string, inP: number | null, outP: number | null): PoolEntry => ({
  id,
  pool: 'agents',
  position: 0,
  name: id,
  vendor: null,
  routes: [{ provider: 'openrouter', model: id }],
  pricing:
    inP == null && outP == null
      ? null
      : { inputPerM: inP, outputPerM: outP, currency: 'USD', capturedAt: '', source: 'test' },
  rating: null,
  note: null,
});

describe('blendedPerM', () => {
  it('blends 75/25 input/output', () => {
    expect(
      blendedPerM({ inputPerM: 4, outputPerM: 8, currency: 'USD', capturedAt: '', source: 's' }),
    ).toBe(5);
  });
  it('falls back to the other half when one price is missing', () => {
    expect(
      blendedPerM({ inputPerM: null, outputPerM: 8, currency: 'USD', capturedAt: '', source: 's' }),
    ).toBe(8);
  });
  it('returns null for no pricing', () => {
    expect(blendedPerM(null)).toBeNull();
  });
});

describe('comparisonRows', () => {
  it('anchors on the priciest and computes cheapness multipliers', () => {
    const rows = comparisonRows([entry('big', 4, 8), entry('small', 1, 2)]);
    expect(rows[0]?.multiplier).toBe(1);
    expect(rows[1]?.multiplier).toBe(4);
  });
  it('leaves unpriced entries without a multiplier', () => {
    const rows = comparisonRows([entry('big', 4, 8), entry('mystery', null, null)]);
    expect(rows[1]?.blended).toBeNull();
    expect(rows[1]?.multiplier).toBeNull();
  });
});

describe('formatters', () => {
  it('formats token volumes', () => {
    expect(fmtMTokens(33.333)).toBe('33.3M tok');
    expect(fmtMTokens(250)).toBe('250M tok');
    expect(fmtMTokens(2000)).toBe('2.0B tok');
  });
  it('formats per-1M prices', () => {
    expect(fmtPerM(15)).toBe('$15.00');
    expect(fmtPerM(0.075)).toBe('$0.075');
    expect(fmtPerM(null)).toBe('—');
  });
});

describe('free models', () => {
  it('a $0/$0 model blends to 0, not null', () => {
    expect(
      blendedPerM({ inputPerM: 0, outputPerM: 0, currency: 'USD', capturedAt: '', source: 's' }),
    ).toBe(0);
  });
  it('a free model gets an Infinity multiplier against a paid anchor', () => {
    const rows = comparisonRows([entry('paid', 4, 8), entry('free', 0, 0)]);
    expect(rows[1]?.blended).toBe(0);
    expect(rows[1]?.multiplier).toBe(Infinity);
  });
  it('an all-free pool has no usable anchor', () => {
    const rows = comparisonRows([entry('free-a', 0, 0), entry('free-b', 0, 0)]);
    expect(rows[0]?.multiplier).toBeNull();
  });
  it('fmtPerM renders zero as Free', () => {
    expect(fmtPerM(0)).toBe('Free');
  });
});
