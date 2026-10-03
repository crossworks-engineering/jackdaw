'use client';

/**
 * A readable view of a context step's decision trace (see context-trace.ts):
 * the stages with their in/out counts and time, then one row per candidate
 * with the arm that found it, its distance and Jev score, and why it was kept
 * or dropped. The raw JSON stays below it in the step's JsonView.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mantle/web-ui/ui/table';
import { cn } from '@mantle/web-ui/lib/utils';
import { blockCounts, shortKey, type ContextTraceLike } from './context-trace';

const num = (n: number | null | undefined) => (typeof n === 'number' ? String(n) : '');

export function ContextTraceView({ trace }: { trace: ContextTraceLike }) {
  const counts = blockCounts(trace.rows);
  return (
    <div className="mt-1 space-y-2 rounded-md border border-border p-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">Decision trace</span>
        {counts.map((c) => (
          <span key={c.b} className="text-muted-foreground">
            {c.b}: <span className="text-success-ink">{c.kept} kept</span>, {c.dropped} dropped
          </span>
        ))}
        {trace.search && (
          <span className="text-muted-foreground">
            search {trace.search.mode}: vector {trace.search.vectorPool}, keyword{' '}
            {trace.search.keywordPool} ({trace.search.keyword}
            {trace.search.terms?.length ? `: ${trace.search.terms.join(', ')}` : ''})
          </span>
        )}
        <span className="text-muted-foreground">{trace.ms} ms</span>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">ms</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trace.stages.map((s, i) => (
              <TableRow key={`${s.name}-${i}`}>
                <TableCell className="font-mono">{s.name}</TableCell>
                <TableCell className="text-right tabular-nums">{s.in}</TableCell>
                <TableCell className="text-right tabular-nums">{s.out}</TableCell>
                <TableCell className="text-right tabular-nums">{s.ms}</TableCell>
                <TableCell className="text-muted-foreground">{s.note ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="max-h-[420px] overflow-auto scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Block</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Arm</TableHead>
              <TableHead className="text-right">Rank</TableHead>
              <TableHead className="text-right">Dist</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Why</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trace.rows.map((r) => (
              <TableRow key={`${r.b}|${r.k}`}>
                <TableCell>{r.b}</TableCell>
                <TableCell className="font-mono" title={r.k}>
                  {shortKey(r.k)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.arm ?? ''}
                  {r.vr !== undefined || r.kr !== undefined
                    ? ` (${[
                        r.vr !== undefined ? `v${r.vr}` : '',
                        r.kr !== undefined ? `k${r.kr}` : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}${r.rescued ? ', rescued' : ''})`
                    : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">{num(r.rank)}</TableCell>
                <TableCell
                  className="text-right tabular-nums"
                  title={r.rd !== undefined ? `ranked by ${r.rd}` : undefined}
                >
                  {num(r.d)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{num(r.s)}</TableCell>
                <TableCell
                  className={cn(r.out === 'kept' ? 'text-success-ink' : 'text-muted-foreground')}
                >
                  {r.out}
                </TableCell>
                <TableCell className="font-mono">
                  {r.at}: {r.why}
                  {r.would && <span className="text-warning-ink"> (shadow: {r.would})</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {trace.more ? (
          <p className="pt-1 text-muted-foreground">{trace.more} more rows not recorded.</p>
        ) : null}
      </div>
    </div>
  );
}
