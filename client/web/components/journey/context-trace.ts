/**
 * The decision trace v1 a context step records (mantle `ContextTrace`,
 * @crossworks/client-types once the contract carries it): per stage, what was
 * considered, kept and dropped, and why. Typed here structurally so the view
 * works against any brain; an older brain's step simply has no trace.
 */
export type TraceRow = {
  b: string;
  k: string;
  out: 'kept' | 'dropped';
  at: string;
  why: string;
  arm?: string;
  rank?: number;
  vr?: number;
  kr?: number;
  rescued?: true;
  d?: number | null;
  rd?: number;
  s?: number;
  would?: string;
};

export type ContextTraceLike = {
  v: 1;
  stages: Array<{ name: string; in: number; out: number; ms: number; note?: string }>;
  search?: {
    mode: string;
    vectorPool: number;
    keywordPool: number;
    keyword: string;
    terms?: string[];
  };
  rows: TraceRow[];
  more?: number;
  ms: number;
};

function isTrace(v: unknown): v is ContextTraceLike {
  const t = v as Partial<ContextTraceLike> | null;
  return (
    !!t && typeof t === 'object' && t.v === 1 && Array.isArray(t.stages) && Array.isArray(t.rows)
  );
}

/** The trace in a step's output: `snapshot.trace` (load_context) or `trace`
 *  (search_chunks). Null when the step has none. */
export function findContextTrace(output: unknown): ContextTraceLike | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as { trace?: unknown; snapshot?: { trace?: unknown } };
  if (isTrace(o.snapshot?.trace)) return o.snapshot.trace;
  if (isTrace(o.trace)) return o.trace;
  return null;
}

/** A row key for a narrow column: the id's first 8 characters, plus the
 *  passage ordinal when there is one. */
export function shortKey(k: string): string {
  const [id, ord] = k.split(':');
  const head = (id ?? '').slice(0, 8);
  return ord !== undefined && ord !== '' ? `${head}:${ord}` : head;
}

/** Kept and dropped counts per block, in first-seen order. */
export function blockCounts(
  rows: readonly TraceRow[],
): Array<{ b: string; kept: number; dropped: number }> {
  const by = new Map<string, { b: string; kept: number; dropped: number }>();
  for (const r of rows) {
    const c = by.get(r.b) ?? { b: r.b, kept: 0, dropped: 0 };
    if (r.out === 'kept') c.kept++;
    else c.dropped++;
    by.set(r.b, c);
  }
  return [...by.values()];
}
