'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { DebugPager, DebugSearchBox } from '@/components/debug/list-nav';
import { fmtRelative } from '../format';
import type { ContextTurnRow } from '@mantle/client-types';
import type { ContextSnapshot, SnapshotItem } from '@mantle/client-types';

const PAGE_SIZE = 15;

type ContextData = { turns: ContextTurnRow[]; total: number };

/** Data-free per-turn retrieval audit: fetches GET /api/debug/context keyed on
 *  the URL's page/q (DebugSearchBox + DebugPager drive the URL). */
export function ContextClient({ page, query }: { page: number; query: string }) {
  const contextQuery = useQuery({
    queryKey: ['debug', 'context', { page, query }],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page) });
      if (query) p.set('q', query);
      return apiFetch<ContextData>(`/api/debug/context?${p.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const turns = contextQuery.data?.turns ?? [];
  const total = contextQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Retrieval per turn — question · context sent · response
        </h2>
        <DebugSearchBox placeholder="Search questions…" />
      </div>

      {contextQuery.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : contextQuery.isError ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          Couldn&apos;t load context turns.
        </p>
      ) : turns.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          {query
            ? 'No turns match your search.'
            : 'No responder turns yet. Ask an agent something (web or Telegram) and the turn will show up here.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {turns.map((t) => (
            <TurnRow key={t.traceId} turn={t} />
          ))}
        </ul>
      )}

      <DebugPager page={page} totalPages={totalPages} total={total} />
    </>
  );
}

function TurnRow({ turn }: { turn: ContextTurnRow }) {
  return (
    <li className="rounded-md border border-border">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        {turn.agentSlug && <span className="font-medium text-foreground">{turn.agentSlug}</span>}
        {turn.surface && <span>{turn.surface}</span>}
        {turn.model && <code className="font-mono">{turn.model}</code>}
        {turn.status === 'error' && <span className="font-medium text-destructive-ink">error</span>}
        <span className="ml-auto flex items-baseline gap-3">
          <span>{fmtRelative(turn.startedAt)}</span>
          <Link
            href={`/debug/journey/${turn.traceId}`}
            className="underline-offset-2 hover:underline"
          >
            trace
          </Link>
        </span>
      </div>
      <div className="grid md:grid-cols-[1fr_1.4fr_1fr] md:divide-x md:divide-border max-md:divide-y max-md:divide-border">
        <QuestionCell turn={turn} />
        <ContextCell snapshot={turn.snapshot} />
        <ResponseCell response={turn.response} />
      </div>
    </li>
  );
}

function QuestionCell({ turn }: { turn: ContextTurnRow }) {
  const snap = turn.snapshot;
  return (
    <div className="space-y-2 p-3">
      <CellLabel>Question</CellLabel>
      {turn.question ? (
        <p className="whitespace-pre-wrap text-sm">{turn.question}</p>
      ) : (
        <p className="text-sm text-muted-foreground">(no inbound text found)</p>
      )}
      {snap?.query.enriched && (
        <div>
          <CellLabel>Embedded as (anaphora-enriched)</CellLabel>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{snap.query.enriched}</p>
        </div>
      )}
      {snap && !snap.query.embedded && (
        <p className="text-xs font-medium text-destructive-ink">
          query was not embedded — retrieval ran without vector search
        </p>
      )}
    </div>
  );
}

function ContextCell({ snapshot }: { snapshot: ContextSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="p-3">
        <CellLabel>Context sent</CellLabel>
        <p className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
          No snapshot — this turn ran before retrieval snapshots were recorded.
        </p>
      </div>
    );
  }
  const counts = [
    `${snapshot.history.count} history turns`,
    `${snapshot.digests.count} digests`,
    // Only an agent still on persona notes (notes_target = persona) has any.
    ...(snapshot.personaNotes.count > 0 ? [`${snapshot.personaNotes.count} persona notes`] : []),
  ].join(' · ');
  return (
    <div className="space-y-3 p-3">
      <CellLabel>Context sent</CellLabel>
      <SnapshotSection
        title="Facts"
        items={snapshot.facts.sent}
        dropped={snapshot.facts.dropped}
        cutoffNote={`guard ${snapshot.facts.guard}`}
      />
      <SnapshotSection
        title="Content hits"
        items={snapshot.contentHits.sent}
        dropped={snapshot.contentHits.dropped}
        cutoffNote={`cutoff ${snapshot.contentHits.cutoff}`}
      />
      <SnapshotSection
        title="Passages"
        items={snapshot.chunkHits.sent}
        dropped={snapshot.chunkHits.dropped}
        cutoffNote={`cutoff ${snapshot.chunkHits.cutoff}`}
      />
      {snapshot.journal && <JournalSection journal={snapshot.journal} />}
      {snapshot.historyRecall && <HistoryRecallSection recall={snapshot.historyRecall} />}
      {snapshot.relations.length > 0 && (
        <div>
          <CellLabel>Relations ({snapshot.relations.length})</CellLabel>
          <ul className="mt-1 space-y-0.5">
            {snapshot.relations.map((r, i) => (
              <li key={i} className="font-mono text-xs text-muted-foreground">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {counts}
        {snapshot.digests.topics.length > 0 && (
          <span> · topics: {snapshot.digests.topics.join(', ')}</span>
        )}
      </p>
    </div>
  );
}

type JournalSnap = NonNullable<ContextSnapshot['journal']>;
type HistoryRecallSnap = NonNullable<ContextSnapshot['historyRecall']>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortId = (id: string) => id.slice(0, 8);

/** What the Journal tiers sent: tier 1 (always-on), the per-message picks
 *  (Jev's journal_recall scores when it ran) and what they made redundant. */
function JournalSection({ journal }: { journal: JournalSnap }) {
  const verb = journal.mode === 'live' ? 'sent' : 'would send';
  const { recall, tier1, dedupe } = journal;
  const redundant = dedupe.facts + dedupe.chunkHits + (dedupe.contentHits ?? 0);
  return (
    <div>
      <CellLabel>
        Journal ({journal.picked.length})
        <span className="ml-2 font-normal normal-case text-muted-foreground/70">
          {journal.mode}
          {journal.skipped === 'small_talk' && ' · skipped (small talk)'}
        </span>
      </CellLabel>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {tier1 && (
          <li>
            Always on: {plural(tier1.shown, 'entry', 'entries')} (
            {tier1.chars.toLocaleString('en-GB')} chars)
            {tier1.overflow > 0 && `, ${tier1.overflow} did not fit`}
          </li>
        )}
        <li>
          Picked for this message: {plural(journal.picked.length, 'entry', 'entries')} {verb} (
          {journal.chars.toLocaleString('en-GB')} chars)
        </li>
        {recall && (
          <li>
            Jev scored {recall.scored} of {plural(recall.rules, 'learned rule')}, picked{' '}
            {recall.picked.length} at {recall.threshold} or more ({recall.mode}, {recall.ms} ms
            {recall.failed > 0 && `, ${plural(recall.failed, 'group')} failed`})
          </li>
        )}
        {redundant > 0 && (
          <li>
            Made redundant: {plural(dedupe.facts, 'fact')}, {plural(dedupe.chunkHits, 'passage')}
            {dedupe.contentHits ? `, ${plural(dedupe.contentHits, 'content hit')}` : ''}
          </li>
        )}
        {journal.gap && <li>Open question offered: {shortId(journal.gap.nodeId)}</li>}
      </ul>
      {journal.picked.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">Picked entries</summary>
          <ul className="mt-1 space-y-0.5">
            {journal.picked.map((p) => (
              <li key={p.nodeId} className="font-mono text-xs text-muted-foreground">
                {p.kind} {shortId(p.nodeId)} ·{' '}
                {p.score != null ? `score ${p.score}` : `sim ${p.similarity.toFixed(2)}`} ·{' '}
                {p.chars} chars{p.whole ? ' · whole' : p.passage ? ' · passage' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** The decider's history_recall: older exchanges scored, and the ones that
 *  rejoined the history (live) or would have (shadow). */
function HistoryRecallSection({ recall }: { recall: HistoryRecallSnap }) {
  const verb = recall.mode === 'live' ? 'added' : 'would add';
  const scored = recall.exchanges.filter((e) => e.score != null);
  return (
    <div>
      <CellLabel>
        History recall ({recall.wouldAdd})
        <span className="ml-2 font-normal normal-case text-muted-foreground/70">
          {recall.mode} · threshold {recall.threshold}
        </span>
      </CellLabel>
      <p className="mt-1 text-xs text-muted-foreground">
        {plural(recall.exchanges.length, 'older exchange')} scored, {verb} {recall.wouldAdd} (
        {recall.chars.toLocaleString('en-GB')} chars), {recall.ms} ms
        {recall.cached && ', cached'}
        {recall.failed > 0 && `, ${plural(recall.failed, 'group')} failed`}
      </p>
      {scored.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">Scores</summary>
          <ul className="mt-1 space-y-0.5">
            {scored.map((e) => (
              <li key={e.back} className="font-mono text-xs text-muted-foreground">
                {e.back} back · score {e.score} · {e.chars} chars
                {(e.score ?? 0) >= recall.threshold ? ` · ${verb}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** One retrieval section: sent items with their ranking distance, plus the
 *  near-misses the cutoff rejected behind a native <details>. */
function SnapshotSection({
  title,
  items,
  dropped,
  cutoffNote,
}: {
  title: string;
  items: SnapshotItem[];
  dropped: SnapshotItem[];
  cutoffNote: string;
}) {
  if (items.length === 0 && dropped.length === 0) return null;
  return (
    <div>
      <CellLabel>
        {title} ({items.length})
        <span className="ml-2 font-normal normal-case text-muted-foreground/70">{cutoffNote}</span>
      </CellLabel>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">none sent</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((it, i) => (
            <SnapshotItemLine key={i} item={it} />
          ))}
        </ul>
      )}
      {dropped.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {dropped.length} near {dropped.length === 1 ? 'miss' : 'misses'} (rejected)
          </summary>
          <ul className="mt-1 space-y-1 opacity-60">
            {dropped.map((it, i) => (
              <SnapshotItemLine key={i} item={it} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SnapshotItemLine({ item }: { item: SnapshotItem }) {
  return (
    <li className="flex items-baseline gap-2 text-xs">
      <DistBadge dist={item.dist} />
      <span className="min-w-0">
        {(item.title || item.entity) && (
          <span className="font-medium">
            {item.title ?? item.entity}
            {item.heading ? ` › ${item.heading}` : ''}
            {item.kind ? (
              <span className="font-normal text-muted-foreground"> ({item.kind})</span>
            ) : null}
            {item.text ? ' — ' : ''}
          </span>
        )}
        <span className="text-muted-foreground">{item.text}</span>
      </span>
    </li>
  );
}

/** Ranking distance (lower = closer). Null means always-injected. */
function DistBadge({ dist }: { dist: number | null }) {
  return (
    <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
      {dist == null ? 'pinned' : dist.toFixed(3)}
    </span>
  );
}

function ResponseCell({ response }: { response: string | null }) {
  return (
    <div className="space-y-2 p-3">
      <CellLabel>Response</CellLabel>
      {response ? (
        // Plain text on purpose — rendering markdown here would let a long
        // reply visually swamp the audit row.
        <pre className="max-h-64 overflow-y-auto scrollbar-thin whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
          {response}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">(no outbound reply found)</p>
      )}
    </div>
  );
}

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}
