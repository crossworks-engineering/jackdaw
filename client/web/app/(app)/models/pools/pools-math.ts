/**
 * Pure math + formatting for the curated-pools comparison table. Split out for
 * unit tests. The $100 comparison: blend 75% input / 25% output tokens (a
 * typical chat mix — stated in the UI), anchor on the priciest entry, and show
 * how many tokens $100 buys on each model plus the cheapness multiplier.
 */

export type PoolDef = {
  id: string;
  label: string;
  description: string;
  group: 'agents' | 'workers';
};

export type PoolRoute = { provider: string; model: string };

export type PoolPricing = {
  inputPerM: number | null;
  outputPerM: number | null;
  currency: string;
  capturedAt: string;
  source: string;
};

export type PoolEntry = {
  id: string;
  pool: string;
  position: number;
  name: string;
  vendor: string | null;
  routes: PoolRoute[];
  pricing: PoolPricing | null;
  rating: number | null;
  note: string | null;
};

const INPUT_SHARE = 0.75;

/** Blended $ per 1M tokens (75% in / 25% out). Null when no usable pricing. */
export function blendedPerM(pricing: PoolPricing | null): number | null {
  if (!pricing) return null;
  const i = pricing.inputPerM;
  const o = pricing.outputPerM;
  if (i == null && o == null) return null;
  // A missing half falls back to the other so a one-sided price still ranks.
  const inP = i ?? o ?? 0;
  const outP = o ?? i ?? 0;
  // 0 is a REAL value: a free model ($0/$0) blends to 0 and must not be
  // confused with "no pricing known" (null).
  return INPUT_SHARE * inP + (1 - INPUT_SHARE) * outP;
}

export type ComparisonRow = {
  entry: PoolEntry;
  /** Blended $ per 1M tokens, null when unpriced. */
  blended: number | null;
  /** How many times cheaper than the pool's priciest entry (1 = the anchor). */
  multiplier: number | null;
};

/** Rows in the pool's stored order, with the anchor = priciest blended price. */
export function comparisonRows(entries: PoolEntry[]): ComparisonRow[] {
  const priced = entries.map((e) => blendedPerM(e.pricing)).filter((v): v is number => v != null);
  const anchor = priced.length ? Math.max(...priced) : null;
  return entries.map((entry) => {
    const blended = blendedPerM(entry.pricing);
    return {
      entry,
      blended,
      // A free model is infinitely cheaper than the anchor — the UI renders
      // Infinity as "free" rather than a number.
      multiplier:
        blended != null && anchor != null && anchor > 0
          ? blended === 0
            ? Infinity
            : anchor / blended
          : null,
    };
  });
}

/** '33.3M tok' / '1.2B tok' for a token count expressed in millions. */
export function fmtMTokens(millions: number): string {
  if (!Number.isFinite(millions)) return '—';
  if (millions >= 1000) return `${(millions / 1000).toFixed(1)}B tok`;
  if (millions >= 100) return `${Math.round(millions)}M tok`;
  return `${millions.toFixed(1)}M tok`;
}

/** '$3.00' / '$0.075' per 1M tokens; em-dash when unknown. */
export function fmtPerM(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v === 0) return 'Free';
  return `$${v >= 1 ? v.toFixed(2) : v.toPrecision(2)}`;
}
