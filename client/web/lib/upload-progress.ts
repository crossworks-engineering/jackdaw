/**
 * Pure helpers for the upload dock: byte/rate/ETA formatting, the size
 * pre-check message, and the aggregate progress across a batch. Kept free of
 * React so they can be unit-tested and reused by any other upload surface.
 */

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < KB) return `${Math.round(n)} B`;
  if (n < MB) return `${(n / KB).toFixed(n < 10 * KB ? 1 : 0)} KB`;
  if (n < GB) return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
  return `${(n / GB).toFixed(2)} GB`;
}

export function formatRate(bytesPerSec: number | null): string {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  if (s < 5) return 'almost done';
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s left`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m left`;
}

/** The message for a file refused before a byte is sent. Says both numbers,
 *  because "too large" on its own sends people guessing. */
export function overLimitMessage(size: number, limit: number): string {
  return `File is ${formatBytes(size)}. The limit is ${formatBytes(limit)}.`;
}

/** Exponential moving average of the transfer rate, so the ETA does not
 *  jitter with every progress event. `prev` null seeds it. */
export function updateRate(
  prev: number | null,
  deltaBytes: number,
  deltaMs: number,
): number | null {
  if (deltaMs <= 0) return prev;
  const instant = (deltaBytes * 1000) / deltaMs;
  if (prev == null) return instant;
  return prev * 0.7 + instant * 0.3;
}

export function etaSeconds(loaded: number, total: number, rate: number | null): number | null {
  if (rate == null || rate <= 0 || total <= 0) return null;
  return Math.max(0, (total - loaded) / rate);
}

export type ProgressLike = {
  status: string;
  size: number;
  loaded: number;
  rate: number | null;
};

export type AggregateProgress = {
  /** Bytes sent across every task that is still counted (not failed, not cancelled). */
  loaded: number;
  total: number;
  /** 0..100 by BYTES, not by file count: one big file moves the bar. */
  pct: number;
  /** Combined rate of the tasks uploading right now, bytes/s. */
  rate: number | null;
  etaSec: number | null;
};

export function aggregateProgress(tasks: readonly ProgressLike[]): AggregateProgress {
  let loaded = 0;
  let total = 0;
  let rate = 0;
  let anyRate = false;
  for (const t of tasks) {
    if (t.status === 'error' || t.status === 'cancelled') continue;
    total += t.size;
    loaded += t.status === 'done' ? t.size : t.loaded;
    if (t.status === 'uploading' && t.rate != null && t.rate > 0) {
      rate += t.rate;
      anyRate = true;
    }
  }
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const r = anyRate ? rate : null;
  return { loaded, total, pct, rate: r, etaSec: etaSeconds(loaded, total, r) };
}
