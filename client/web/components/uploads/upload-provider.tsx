'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RotateCcw,
  UploadCloud,
  X,
} from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { isCrossOrigin, runtimeApiBase } from '@mantle/web-ui/runtime-env';
import { tokenStore } from '@mantle/web-ui/token-store';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  aggregateProgress,
  etaSeconds,
  formatBytes,
  formatEta,
  formatRate,
  overLimitMessage,
  updateRate,
} from '@/lib/upload-progress';
import { UploadAbortedError, xhrUpload } from '@/lib/xhr-upload';

/**
 * App-wide background file uploader. Lives in the persistent app shell so a
 * drop on /files keeps uploading while you navigate anywhere else in Mantle.
 * Uploads run with bounded concurrency, continue past individual failures,
 * and surface progress in a floating dock. A `beforeunload` guard covers the
 * one case an in-tab manager can't survive: a full reload / tab close.
 *
 * Progress is by BYTES (XMLHttpRequest, see lib/xhr-upload), with speed and
 * time left, a size check against the server's cap BEFORE a byte is sent, a
 * stall watchdog, cancel, and retry. The old fetch-based loop showed one
 * spinner and a bar that counted finished files: a single 250 MB upload sat
 * at 0% for half an hour and then said nothing when it died.
 *
 * Each successful POST creates a `file` node → `node_ingested` → the realtime
 * layer refreshes /files live, so the manager never has to cross-talk to it.
 */
export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';

export type UploadTask = {
  id: string;
  name: string;
  parentPath: string;
  status: UploadStatus;
  size: number;
  loaded: number;
  /** Smoothed bytes/s while uploading; null before the first sample. */
  rate: number | null;
  error?: string;
  /** False when the failure is final (refused as too large): retry is pointless. */
  retryable?: boolean;
};

type UploadApi = {
  tasks: UploadTask[];
  active: boolean;
  /** The server's per-file cap (from /api/shell); null until known. */
  maxUploadBytes: number | null;
  setMaxUploadBytes: (bytes: number | null) => void;
  enqueue: (input: FileList | File[], parentPath: string) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  clearFinished: () => void;
};

const UploadContext = createContext<UploadApi | null>(null);

/** How many files upload at once. Sequential was slow for a 20-file batch. */
const CONCURRENCY = 3;
/** Progress writes are throttled to this so a fast link does not re-render
 *  the dock hundreds of times a second. */
const PROGRESS_TICK_MS = 150;
/** What an old server (no `maxUploadBytes` in /api/shell) accepts. */
const LEGACY_LIMIT_BYTES = 64 * 1024 * 1024;

type Pending = { file: File; parentPath: string; controller?: AbortController };

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(null);
  const limitRef = useRef<number | null>(null);
  limitRef.current = maxUploadBytes;
  const pendingRef = useRef(new Map<string, Pending>());
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(0);
  const idRef = useRef(0);
  const uploadOneRef = useRef<(id: string) => Promise<void>>(undefined);
  const toast = useToast();

  const update = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // Start as many uploads as concurrency allows. Calls the latest uploader via
  // a ref so pump/uploadOne can reference each other without a render cycle.
  const pump = useCallback(() => {
    while (runningRef.current < CONCURRENCY && queueRef.current.length > 0) {
      const id = queueRef.current.shift()!;
      runningRef.current++;
      void uploadOneRef.current?.(id);
    }
  }, []);

  uploadOneRef.current = async (id: string) => {
    const entry = pendingRef.current.get(id);
    if (!entry) {
      runningRef.current = Math.max(0, runningRef.current - 1);
      pump();
      return;
    }
    const controller = new AbortController();
    entry.controller = controller;
    update(id, { status: 'uploading', loaded: 0, rate: null, error: undefined });

    // Progress bookkeeping lives outside React state; state gets a throttled copy.
    let lastLoaded = 0;
    let lastAt = performance.now();
    let rate: number | null = null;
    let lastWrite = 0;
    const onProgress = (loaded: number) => {
      const now = performance.now();
      rate = updateRate(rate, loaded - lastLoaded, now - lastAt);
      lastLoaded = loaded;
      lastAt = now;
      if (now - lastWrite < PROGRESS_TICK_MS && loaded < entry.file.size) return;
      lastWrite = now;
      update(id, { loaded, rate });
    };

    try {
      const form = new FormData();
      form.set('parentPath', entry.parentPath);
      form.set('file', entry.file);
      const token = tokenStore.get();
      await xhrUpload({
        url: `${runtimeApiBase()}/api/files/files`,
        form,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        // Same rule as apiFetch: cookie on same-origin, bearer only across origins.
        withCredentials: !isCrossOrigin(),
        signal: controller.signal,
        onProgress,
      });
      update(id, { status: 'done', loaded: entry.file.size, rate: null });
      pendingRef.current.delete(id);
    } catch (err) {
      if (err instanceof UploadAbortedError) {
        update(id, { status: 'cancelled', rate: null });
        pendingRef.current.delete(id);
      } else {
        // Keep the File so "retry" can resend it without a new picker round.
        update(id, {
          status: 'error',
          rate: null,
          error: err instanceof Error ? err.message : 'Upload failed.',
          retryable: true,
        });
      }
    } finally {
      entry.controller = undefined;
      runningRef.current = Math.max(0, runningRef.current - 1);
      pump();
    }
  };

  const enqueue = useCallback(
    (input: FileList | File[], parentPath: string) => {
      const files = Array.from(input).filter((f) => f.size > 0);
      if (files.length === 0) return;
      const limit = limitRef.current ?? LEGACY_LIMIT_BYTES;
      const fresh: UploadTask[] = [];
      const refused: string[] = [];
      for (const file of files) {
        const id = `u${idRef.current++}`;
        const base = {
          id,
          name: file.name,
          parentPath,
          size: file.size,
          loaded: 0,
          rate: null,
        };
        if (file.size > limit) {
          // Refused here, not by the server: no bytes leave the machine, and
          // the message carries both numbers instead of a bare "too large".
          fresh.push({
            ...base,
            status: 'error',
            error: overLimitMessage(file.size, limit),
            retryable: false,
          });
          refused.push(file.name);
          continue;
        }
        pendingRef.current.set(id, { file, parentPath });
        queueRef.current.push(id);
        fresh.push({ ...base, status: 'pending' });
      }
      setTasks((ts) => [...ts, ...fresh]);
      if (refused.length > 0) {
        toast.error(
          refused.length === 1
            ? `${refused[0]} is over the ${formatBytes(limit)} upload limit.`
            : `${refused.length} files are over the ${formatBytes(limit)} upload limit.`,
        );
      }
      pump();
    },
    [pump, toast],
  );

  const cancel = useCallback(
    (id: string) => {
      const entry = pendingRef.current.get(id);
      if (entry?.controller) {
        entry.controller.abort(); // the uploader marks it cancelled
        return;
      }
      // Still queued: pull it before it starts.
      queueRef.current = queueRef.current.filter((q) => q !== id);
      pendingRef.current.delete(id);
      update(id, { status: 'cancelled' });
    },
    [update],
  );

  const retry = useCallback(
    (id: string) => {
      const entry = pendingRef.current.get(id);
      if (!entry || entry.controller) return;
      update(id, { status: 'pending', loaded: 0, rate: null, error: undefined });
      queueRef.current.push(id);
      pump();
    },
    [pump, update],
  );

  const clearFinished = useCallback(() => {
    setTasks((ts) => {
      const keep = ts.filter((t) => t.status === 'pending' || t.status === 'uploading');
      const keepIds = new Set(keep.map((t) => t.id));
      for (const id of Array.from(pendingRef.current.keys())) {
        if (!keepIds.has(id)) pendingRef.current.delete(id);
      }
      return keep;
    });
  }, []);

  const active = useMemo(
    () => tasks.some((t) => t.status === 'pending' || t.status === 'uploading'),
    [tasks],
  );

  // Guard against losing in-flight uploads to a reload / tab close.
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);

  const api = useMemo<UploadApi>(
    () => ({
      tasks,
      active,
      maxUploadBytes,
      setMaxUploadBytes,
      enqueue,
      cancel,
      retry,
      clearFinished,
    }),
    [tasks, active, maxUploadBytes, enqueue, cancel, retry, clearFinished],
  );

  return <UploadContext.Provider value={api}>{children}</UploadContext.Provider>;
}

export function useUploads(): UploadApi {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUploads must be used inside <UploadProvider>');
  return ctx;
}

/**
 * Floating progress dock — rendered inside the shell so it inherits the
 * `--activity-w` rail var (sits just left of the live-activity column on lg).
 * Hidden when there's nothing to show.
 */
export function UploadDock() {
  const { tasks, active, cancel, retry, clearFinished } = useUploads();
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'error').length;
  const cancelled = tasks.filter((t) => t.status === 'cancelled').length;
  const finished = done + failed + cancelled;
  const agg = aggregateProgress(tasks);

  const heading = active
    ? [
        `Uploading ${Math.min(finished + 1, total)}/${total}`,
        `${agg.pct}%`,
        formatRate(agg.rate),
        formatEta(agg.etaSec),
      ]
        .filter(Boolean)
        .join(' · ')
    : failed > 0
      ? `Uploaded ${done} · ${failed} failed${cancelled ? ` · ${cancelled} cancelled` : ''}`
      : cancelled > 0
        ? `Uploaded ${done} · ${cancelled} cancelled`
        : `Uploaded ${done} file${done === 1 ? '' : 's'}`;

  return (
    <div className="pointer-events-auto w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
      >
        {active ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary-ink" aria-hidden />
        ) : failed > 0 ? (
          <AlertCircle className="size-4 shrink-0 text-destructive-ink" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-primary-ink" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            collapsed && '-rotate-90',
          )}
          aria-hidden
        />
      </button>

      <div
        className="h-0.5 w-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={agg.pct}
      >
        <div
          className={cn('h-full transition-all', failed > 0 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${agg.pct}%` }}
        />
      </div>

      {!collapsed && (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto scrollbar-thin border-t border-border">
          {tasks.map((t) => (
            <UploadRow key={t.id} task={t} onCancel={cancel} onRetry={retry} />
          ))}
        </ul>
      )}

      {!active && (
        <div className="flex justify-end border-t border-border px-2 py-1.5">
          <button
            type="button"
            onClick={clearFinished}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden /> Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function UploadRow({
  task: t,
  onCancel,
  onRetry,
}: {
  task: UploadTask;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const pct = t.size > 0 ? Math.min(100, Math.round((t.loaded / t.size) * 100)) : 0;
  const detail =
    t.status === 'uploading'
      ? [
          `${pct}%`,
          `${formatBytes(t.loaded)} of ${formatBytes(t.size)}`,
          formatEta(etaSeconds(t.loaded, t.size, t.rate)),
        ]
          .filter(Boolean)
          .join(' · ')
      : t.status === 'pending'
        ? `Waiting · ${formatBytes(t.size)}`
        : t.status === 'done'
          ? formatBytes(t.size)
          : t.status === 'cancelled'
            ? 'Cancelled'
            : (t.error ?? 'Upload failed.');
  const canCancel = t.status === 'pending' || t.status === 'uploading';
  const canRetry = t.status === 'error' && t.retryable !== false;

  return (
    <li className="flex items-start gap-2 px-3 py-1.5 text-xs">
      {t.status === 'uploading' ? (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary-ink" aria-hidden />
      ) : t.status === 'done' ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary-ink" aria-hidden />
      ) : t.status === 'error' ? (
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive-ink" aria-hidden />
      ) : (
        <UploadCloud className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate" title={t.name}>
          {t.name}
        </span>
        <span
          className={cn(
            'truncate',
            t.status === 'error' ? 'text-destructive-ink' : 'text-muted-foreground',
          )}
          title={detail}
        >
          {detail}
        </span>
        {t.status === 'uploading' && (
          <span className="mt-1 h-0.5 w-full overflow-hidden rounded bg-muted">
            <span className="block h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
      {canCancel && (
        <button
          type="button"
          onClick={() => onCancel(t.id)}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Cancel ${t.name}`}
          title="Cancel"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={() => onRetry(t.id)}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Retry ${t.name}`}
          title="Retry"
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}
