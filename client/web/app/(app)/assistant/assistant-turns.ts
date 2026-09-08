/**
 * The pure layer behind the assistant thread: the message and turn shapes, the pairing of messages into turns, and the two text helpers.
 *
 * Moved out of assistant-client.tsx unchanged (structure pass, phase 1):
 * already standalone, just living in the wrong file. No signatures changed.
 */
import { type ContextKind, type ContextRef } from '@/components/assistant/assistant-dock';
import { type ThoughtEvent } from '@/components/assistant/use-turn-stream';

/** Kinds whose surface `id` is NOT a node id, so the preamble must not call it
 *  one — the brain resolves these (see `ContextRef`). Today only `email`, whose
 *  id is the `emails` row id. Naming it "node <id>" would send the agent's node
 *  tools after an id that cannot resolve. */
export const NON_NODE_KINDS: ReadonlySet<ContextKind> = new Set<ContextKind>(['email']);

/** Human-readable noun per context kind — used in chips and the preamble. */
export const CONTEXT_KIND_LABEL: Record<ContextKind, string> = {
  file: 'file',
  folder: 'folder',
  page: 'page',
  note: 'note',
  table: 'table',
  journal: 'journal entry',
  task: 'task',
  event: 'event',
  app: 'app',
  draw: 'drawing',
  formula: 'formula',
  email: 'email',
  contact: 'contact',
};

/** A sidecar artifact attached to a message. Mirrors @mantle/tools
 *  ToolArtifact, with the discriminated `kind` driving the rendering
 *  (audio = play button, image = inline preview). Outbound artifacts
 *  come from tool calls; inbound artifacts come from user uploads.
 *
 *  `localPreviewUrl` is purely client-side: when the user picks an
 *  image we render the local file URL immediately for instant
 *  feedback. Once the server round-trips we replace it with the
 *  base64 payload the API returned. */
export type Artifact = {
  kind: 'audio' | 'image';
  mimeType: string;
  base64: string;
  caption?: string;
  nodeId?: string;
  producedBy: string;
  localPreviewUrl?: string;
};

/** A persisted media reference on a turn (DB-backed, no bytes), mirroring
 *  @mantle/db ConversationAttachment. Defined locally so this client component
 *  doesn't import @mantle/db (keeps postgres out of the browser bundle). Images
 *  with a nodeId render via the file-bytes route; everything else is a labeled
 *  chip (its content — e.g. a voice transcript — already lives in the text). */
export type StoredAttachment = {
  kind: 'image' | 'audio' | 'voice' | 'document' | 'video';
  mime?: string;
  caption?: string;
  nodeId?: string;
  fileId?: string;
  url?: string;
};

export type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  text: string;
  model?: string | null;
  createdAt: string;
  /** Transport this turn came in on. 'web' (or undefined) renders no badge;
   *  'telegram' etc. show a small channel chip so the unified stream makes its
   *  cross-channel origin obvious. */
  channel?: string;
  /** Persisted media on the turn (rendered on load). Distinct from `artifacts`,
   *  which carries live bytes from the just-completed turn (tool output / the
   *  image the user just uploaded). */
  attachments?: StoredAttachment[];
  /** Sidecar artifacts produced by worker tools during this turn.
   *  Only ever populated on outbound messages. */
  artifacts?: Artifact[];
  /** Optimistic flag while we wait for the server reply. */
  pending?: boolean;
  /** Durable execution state (migration 0105). Outbound rows are 'pending' while
   *  the runner works, 'complete' when the reply lands, 'failed' on error — so a
   *  reload mid-turn renders the right state. Undefined on optimistic rows. */
  status?: 'pending' | 'complete' | 'failed';
  /** Failure reason for a 'failed' turn; null/undefined otherwise. */
  error?: string | null;
  /** The grounded status steps streamed during this turn, frozen onto the reply
   *  as a persistent "thought" record. Outbound only; session-scoped (the
   *  durable record is the trace). */
  thoughts?: ThoughtEvent[];
  /** Real output-token total for the turn, from the `done` event — shown on the
   *  frozen thought-trail summary. Session-scoped (not persisted). */
  tokens?: number;
  /** Wall-clock duration of the turn (ms), measured client-side from the live
   *  stream — shown on the frozen thought-trail summary. Session-scoped. */
  durationMs?: number;
  /** Deterministic tool-outcome tally persisted at finalize — the runtime's
   *  own ledger of what ran vs failed this turn, independent of what the
   *  reply claims. Drives the footer count + the failed-calls notice. */
  toolStats?: ToolStats;
  /** This row belongs to a replaced (superseded) turn pair — the user stopped
   *  the turn mid-stream and re-sent original + correction as one combined
   *  turn. Rendered dimmed with a "replaced" tag; never hidden. */
  superseded?: boolean;
};

export type ToolStats = {
  calls: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Confirm-gated calls parked behind operator approval — not yet run. */
  queued: number;
  failures: Array<{ slug: string; error: string }>;
};

/** A conversational turn: the user's prompt and Saskia's response. The
 *  document layout pairs them — the response is the reading canvas, the
 *  prompt floats in the right margin, anchored to the response it produced. */
export type Turn = { id: string; prompt?: Message; response?: Message };

/** Fold the flat message stream into prompt→response turns. A new turn
 *  starts on each inbound; the next outbound attaches to it. Leading or
 *  orphan outbounds get their own promptless turn (rare). */
export function groupTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.direction === 'inbound') {
      turns.push({ id: m.id, prompt: m });
    } else {
      const last = turns[turns.length - 1];
      if (last && last.prompt && !last.response) last.response = m;
      else turns.push({ id: m.id, response: m });
    }
  }
  return turns;
}

/** Render context nodes as a reference block appended to the sent message. The
 *  agent reads them via its tools (file_read / note_get / page_get / …) — node
 *  ids are enough; we never inline content here. Pinned nodes (the open
 *  page/table/app) are phrased as the live on-screen subject — and since the
 *  responder may delegate the actual editing to a specialist, the preamble
 *  tells her to pass the node id (and any FOCUS SET) along verbatim. */
export function buildContextPreamble(pinned: ContextRef[], picked: ContextRef[]): string {
  const line = (r: ContextRef) => {
    // `id` is kind-relative. Only claim "node" when it actually is one.
    const ref = NON_NODE_KINDS.has(r.kind) ? `${r.kind} id ${r.id}` : `node ${r.id}`;
    // Cheap identifying data rides along — a folder path, an active tab, a mail
    // thread key. Sorted so the same ref always renders identically.
    const meta = Object.entries(r.meta ?? {})
      .filter(([, v]) => v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `- ${CONTEXT_KIND_LABEL[r.kind]} "${r.label}" (${ref})${meta ? ` [${meta}]` : ''}`;
  };
  const parts: string[] = [];
  if (pinned.length > 0) {
    parts.push(
      `On screen right now — the user has this open in the editor and means it by "this ${CONTEXT_KIND_LABEL[pinned[0]!.kind]}" (if a specialist does the work, hand it the node id and any focus directive verbatim):\n${pinned
        .map(line)
        .join('\n')}`,
    );
  }
  if (picked.length > 0) {
    parts.push(
      `Attached context (read these with your tools as needed):\n${picked.map(line).join('\n')}`,
    );
  }
  if (parts.length === 0) return '';
  return `\n\n---\n${parts.join('\n')}`;
}

/** The machine-appended tail of a sent message — the on-screen context
 *  preamble and/or the FOCUS SET directive. The durable inbound row stores the
 *  FULL sent text (that's what the agent read), but the transcript shows just
 *  what the user typed, with a quiet "context attached" footer whose tooltip
 *  reveals the appended block. Markers match buildContextPreamble /
 *  buildFocusDirective exactly. */
export function splitSentContext(text: string): { typed: string; appended: string | null } {
  const positions = [
    text.indexOf('\n\n---\nOn screen right now'),
    text.indexOf('\n\n---\nAttached context'),
    text.indexOf('\nFOCUS SET —'),
  ].filter((i) => i >= 0);
  if (positions.length === 0) return { typed: text, appended: null };
  const cut = Math.min(...positions);
  return { typed: text.slice(0, cut).trimEnd(), appended: text.slice(cut).trim() };
}
