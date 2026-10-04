/**
 * Provider outages: embeddings or extraction failing (no credits, a refused
 * key, a long outage). The brain records them (mantle migration 0230,
 * docs/embeddings.md "Provider outages") and sends them to admins in the
 * "Needs you" answer as `providers`, and on GET /api/embedding/recover.
 * Members and clients never get them (both routes refuse them).
 *
 * The `reason` is fixed text the brain picks by error code, never provider
 * text, so it is safe on a banner. Pure helpers only: no DOM here.
 */
import type { NeedsYou } from '@mantle/client-types';

/**
 * One open outage. Mirrors `ProviderAlert` in @mantle/client-types (mantle
 * 0.238): declared here until the pinned contract package carries it.
 */
export type ProviderAlert = {
  subject: 'embedding' | 'extraction';
  code: string;
  permanent: boolean;
  reason: string;
  provider: string | null;
  model: string | null;
  /** When it started failing (ISO). */
  since: string;
  /** The extract queue waits until it works again. */
  paused: boolean;
  /** When the brain tries one tiny call again (ISO), or null. */
  nextProbeAt: string | null;
  /** Extract jobs that wait. Null when the queue has not started. */
  waiting: number | null;
};

export const PROVIDER_ALERTS_KEY = ['provider-alerts'] as const;
export const RECOVER_PATH = '/api/embedding/recover';

/** The outages in a "Needs you" answer. A brain before 0230 sends none. */
export function providerAlertsOf(n: NeedsYou | null | undefined): ProviderAlert[] {
  const list = (n as (NeedsYou & { providers?: ProviderAlert[] }) | null | undefined)?.providers;
  return Array.isArray(list) ? list : [];
}

const SUBJECT: Record<ProviderAlert['subject'], { failing: string; impact: string }> = {
  embedding: {
    failing: 'Embeddings are failing',
    impact: 'New files are not indexed and search has less context.',
  },
  extraction: {
    failing: 'Extraction is failing',
    impact: 'New files get no summary, facts or index.',
  },
};

/** "08:14", or "3 Oct, 08:14" when not today. */
export function sinceText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

/** The short rail label: "Embeddings are failing". */
export function alertTitle(a: ProviderAlert): string {
  return SUBJECT[a.subject].failing;
}

/** "Embeddings are failing since 08:14: <reason>" */
export function alertHeadline(a: ProviderAlert, now?: Date): string {
  const since = sinceText(a.since, now);
  return `${SUBJECT[a.subject].failing}${since ? ` since ${since}` : ''}: ${a.reason}`;
}

/** What it does to the brain, with the count waiting. */
export function alertImpact(a: ProviderAlert): string {
  const waiting =
    a.waiting && a.waiting > 0 ? ` ${a.waiting} item${a.waiting === 1 ? ' waits' : 's wait'}.` : '';
  return `${SUBJECT[a.subject].impact}${waiting}`;
}

/** What the admin can do, by error code. */
export function alertFix(a: ProviderAlert): string {
  const where = a.subject === 'embedding' ? 'Settings, Embedding' : 'Settings, AI workers';
  switch (a.code) {
    case 'quota':
      return `Add credits to the ${providerName(a.provider)} account, or switch provider in ${where}. A backup route keeps it working next time.`;
    case 'auth':
      return `Check the API key in Settings, Keys, or switch provider in ${where}.`;
    case 'no_key':
      return `Add an API key in Settings, Keys, or switch provider in ${where}.`;
    case 'model':
      return `Pick a model the provider offers in ${where}.`;
    default:
      return `The brain retries by itself. If it lasts, switch provider or add a backup route in ${where}.`;
  }
}

/** Where to fix it. */
export function alertHref(a: ProviderAlert): string {
  return a.subject === 'embedding' ? '/settings/embedding' : '/settings/ai-workers';
}

/** When the brain tries again by itself, or null. */
export function nextTryText(a: ProviderAlert, now: Date = new Date()): string | null {
  if (!a.nextProbeAt) return null;
  const ms = Date.parse(a.nextProbeAt) - now.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 60_000) return 'The brain tries again within a minute.';
  return `The brain tries again in ${Math.round(ms / 60_000)} min.`;
}

function providerName(p: string | null): string {
  if (!p) return 'provider';
  const names: Record<string, string> = {
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    google: 'Google',
    mistral: 'Mistral',
    cohere: 'Cohere',
    local: 'local',
  };
  return names[p] ?? p;
}

/** One key per outage: a new one after a fix is a new arrival. */
export const alertKey = (a: ProviderAlert) => `${a.subject}@${a.since}`;
