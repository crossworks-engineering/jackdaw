'use client';

/**
 * The embedding field group for the worker form, including the reindex affordance.
 *
 * Moved out of worker-form.tsx unchanged (structure pass, phase 1): the
 * components were already standalone and took plain props, they were just
 * living in a 2,507-line file. No signatures changed.
 */
import { useEffect, useState } from 'react';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiSend } from '@mantle/web-ui/api-fetch';

// Mirrors `EMBEDDING_DIMS` in @mantle/embeddings and the `vector(768)`
// schema columns (migration 0060). Kept as a local literal — importing the
// server module into this client component would drag `postgres` into the
// browser bundle. If you migrate the column dim again, change both.
export const COLUMN_DIMS = 768;
const KNOWN_DIMS: Record<string, number> = {
  // Lower-cased slug → NATIVE dimensions for routes we've confirmed.
  // Keep growing this map; anything not here triggers the Test button
  // affordance below to verify live. Native-768 models fit the column;
  // MRL models (3-large, gemini) list their native dim here and are
  // blocked by the guard — truncation-aware fit isn't modelled yet.
  'embeddinggemma:latest': 768,
  'openai/text-embedding-3-small': 1536,
  'openai/text-embedding-3-large': 3072,
  'openai/text-embedding-ada-002': 1536,
  'google/gemini-embedding-2-preview': 1536,
  'nvidia/llama-nemotron-embed-vl-1b-v2': 1024,
  'nvidia/llama-nemotron-embed-vl-1b-v2:free': 1024,
  'thenlper/gte-base': 768,
  'thenlper/gte-large': 1024,
  'intfloat/e5-base-v2': 768,
  'intfloat/e5-large-v2': 1024,
  'perplexity/pplx-embed-v1-4b': 1024,
  'perplexity/pplx-embed-v1-0.6b': 1024,
};

export function EmbeddingFields({
  model,
  savedModel,
  onDimChange,
}: {
  model: string;
  /** Model the worker was loaded with (edit mode) — null in create mode.
   *  Used by the rebuild affordance to (a) only show when there's a
   *  saved worker to rebuild against, and (b) detect a model swap that
   *  needs save-first. */
  savedModel: string | null;
  /** Lifts the resolved-dim state (just-tested OR known) so the parent
   *  form's save button can hard-block when it's non-768. Called on
   *  every dim change, including null (no signal). */
  onDimChange: (dim: number | null) => void;
}) {
  const toast = useToast();
  const slug = (model ?? '').toLowerCase().trim();
  const knownDim = slug ? KNOWN_DIMS[slug] : undefined;

  // Detected-dim cache per slug, populated by the Test button. Survives
  // model-picker changes within the form session so flipping back to a
  // previously-tested model doesn't require re-testing.
  const [detected, setDetected] = useState<Record<string, number>>({});
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Rebuild state — tracks the in-flight server action and the most
  // recent completion stats so the operator sees the result inline.
  const [rebuilding, setRebuilding] = useState(false);
  const [lastRebuild, setLastRebuild] = useState<
    | null
    | {
        ok: true;
        model: string;
        totalRows: number;
        totalWritten: number;
        durationMs: number;
      }
    | { ok: false; error: string }
  >(null);

  // Resolved dim (just-tested wins over allow-list; both win over unknown).
  const dim = detected[slug] ?? knownDim ?? null;
  const mismatched = dim !== null && dim !== COLUMN_DIMS;
  const modelDirty = savedModel !== null && slug !== savedModel.toLowerCase();

  // Lift to parent on every change so the save button reacts immediately.
  useEffect(() => {
    onDimChange(dim);
  }, [dim, onDimChange]);

  const onTest = async () => {
    if (!slug) return;
    setTesting(true);
    setTestError(null);
    try {
      const r = await apiSend<{ ok: true; dimensions: number } | { ok: false; error: string }>(
        '/api/ai-workers/test-embedding',
        'POST',
        { model: slug },
      );
      if (r.ok) {
        setDetected((d) => ({ ...d, [slug]: r.dimensions }));
      } else {
        setTestError(r.error);
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  const onRebuild = async () => {
    setRebuilding(true);
    setLastRebuild(null);
    try {
      const r = await apiSend<
        | {
            ok: true;
            model: string;
            result: { totalRows: number; totalWritten: number; durationMs: number };
          }
        | { ok: false; error: string }
      >('/api/ai-workers/reembed', 'POST');
      if (r.ok) {
        setLastRebuild({
          ok: true,
          model: r.model,
          totalRows: r.result.totalRows,
          totalWritten: r.result.totalWritten,
          durationMs: r.result.durationMs,
        });
        toast.success(
          `Rebuilt ${r.result.totalWritten} vectors in ${(r.result.durationMs / 1000).toFixed(1)}s`,
        );
      } else {
        setLastRebuild({ ok: false, error: r.error });
        toast.error(`Rebuild failed: ${r.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastRebuild({ ok: false, error: msg });
      toast.error(`Rebuild failed: ${msg}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card/40 p-3 text-sm">
      <p className="text-muted-foreground">
        Embedding is a single text→vector transformation. No temperature, no max-tokens. Picking a
        model here applies it to every embedding call in the stack — extractor writes, agent
        semantic-memory reads, recall, MCP search, and the tool-result spill query.
      </p>
      <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Column shape</dt>
        <dd className="font-mono tabular-nums">vector({COLUMN_DIMS})</dd>
        <dt className="text-muted-foreground">Selected model dim</dt>
        <dd className="flex items-center gap-2">
          <span className="font-mono tabular-nums">
            {dim !== null ? (
              <span className={mismatched ? 'text-destructive-ink' : 'text-foreground'}>{dim}</span>
            ) : slug ? (
              <span className="text-muted-foreground">untested</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {detected[slug] !== undefined && (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                (live)
              </span>
            )}
            {detected[slug] === undefined && knownDim !== undefined && (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                (allow-list)
              </span>
            )}
          </span>
          {slug && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={testing}
              title="Embed a sample string and read back the actual dimension"
            >
              {testing ? 'Testing…' : 'Test dimensions'}
            </Button>
          )}
        </dd>
      </dl>
      {testError && (
        <p className="rounded border border-warning/30 bg-warning/10 p-2 text-xs text-warning-ink">
          Test failed: {testError}
          {testError.toLowerCase().includes('api key') && (
            <>
              {' '}
              Add an OpenRouter key at{' '}
              <a href="/settings/keys" className="underline">
                /settings/keys
              </a>
              .
            </>
          )}
        </p>
      )}
      {mismatched && (
        <div className="space-y-1 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive-ink">
          <p>
            <strong>Dimension mismatch.</strong> This model emits {dim}-dim vectors; the brain's
            column is {COLUMN_DIMS}. Save is blocked — switching would crash ingest on the first
            call.
          </p>
          <p className="text-destructive-ink/80">
            To use a non-{COLUMN_DIMS}-dim model you'd need a schema migration on every{' '}
            <code className="font-mono">vector({COLUMN_DIMS})</code> column (nodes, entities, facts,
            content_chunks) plus a full re-embed. Not a button — drop into{' '}
            <code className="font-mono">psql</code> and use{' '}
            <code className="font-mono">pnpm re-embed</code>.
          </p>
        </div>
      )}
      {!mismatched && dim === null && slug && (
        <p className="text-xs text-muted-foreground">
          Unverified. Click <strong>Test dimensions</strong> to confirm — if the model emits
          anything other than {COLUMN_DIMS}-dim vectors, saving will succeed but ingest will fail on
          first call.
        </p>
      )}
      {savedModel && modelDirty && !mismatched && (
        <p className="text-xs text-warning-ink">
          Model changed from <code className="font-mono">{savedModel}</code>. Save first, then click{' '}
          <strong>Rebuild Index</strong> below — existing vectors were embedded with the previous
          model and cosine similarity across different models is meaningless.
        </p>
      )}
      {savedModel && !mismatched && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="space-y-0.5 text-xs">
            <p className="font-medium text-foreground">Rebuild Index</p>
            <p className="text-muted-foreground">
              Re-embed every stored vector (nodes · entities · facts) against the currently saved
              model. Cache-aware — re-running against the same model is free.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRebuild}
            disabled={rebuilding || modelDirty}
            title={
              modelDirty
                ? 'Save the new model first — rebuild reads the saved value, not the picker.'
                : 'Re-embed all stored vectors against the saved model'
            }
          >
            {rebuilding ? 'Rebuilding…' : 'Rebuild Index'}
          </Button>
        </div>
      )}
      {lastRebuild?.ok && (
        <p className="text-xs text-muted-foreground">
          Rebuilt <span className="font-mono tabular-nums">{lastRebuild.totalWritten}</span> vectors
          against <code className="font-mono">{lastRebuild.model}</code> in{' '}
          <span className="font-mono tabular-nums">
            {(lastRebuild.durationMs / 1000).toFixed(1)}s
          </span>
          .
        </p>
      )}
      {lastRebuild && !lastRebuild.ok && (
        <p className="text-xs text-destructive-ink">Rebuild failed: {lastRebuild.error}</p>
      )}
    </div>
  );
}
