'use client';

/**
 * Shared live-turn state + presentation for the TEAM surfaces (Team Chat and
 * the Forum topic view). Both clients tail /api/team/turn/[turnId]/stream with
 * near-identical SSE handlers; this module is the single event router so the
 * two can't drift (the drift already happened once: both kept ONE status
 * string, so every status event overwrote the last and the narrator's
 * paragraph vanished, and neither handled `reasoning-delta` at all).
 *
 * The owner assistant has its own richer machinery (use-turn-stream +
 * ThoughtTrail) — this is deliberately the lighter member-facing treatment.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';

/** One in-flight team turn as the member sees it. `status` is the CURRENT
 *  grounded activity line (each replaces the last — that's correct for tool
 *  ticks). `narration` is the narrator's warm first-person line: it only moves
 *  forward when a newer narrated event lands, so a plain status can never
 *  clear it. `reasoning` accumulates the model's streamed thinking. */
export type LiveTurn = {
  turnId: string;
  status: string | null;
  narration: string | null;
  reasoning: string;
  text: string;
};

export function emptyLiveTurn(turnId: string): LiveTurn {
  return { turnId, status: 'Thinking…', narration: null, reasoning: '', text: '' };
}

/** The subset of a turn event the team clients act on. Parsed loosely — the
 *  stream carries the full TurnEvent union but these surfaces only render
 *  status/narration, reasoning, and reply text (done/error stay caller-side,
 *  tied as they are to each view's reconcile flow). */
export type LiveTurnEvent = {
  type: string;
  data: { label?: string; text?: string; narrated?: boolean };
};

/** Fold one stream event into the live turn (pure — exported for tests).
 *  Narrated status → `narration` (persistent), plain status → `status`
 *  (replaced each step), reasoning-delta appends, text-delta appends and
 *  clears the grounded status line (the reply is now the show). Unhandled
 *  event types return the state unchanged. */
export function applyLiveTurnEvent(l: LiveTurn, event: LiveTurnEvent): LiveTurn {
  if (event.type === 'status' && event.data.label) {
    return event.data.narrated === true
      ? { ...l, narration: event.data.label }
      : { ...l, status: event.data.label };
  }
  if (event.type === 'reasoning-delta' && event.data.text) {
    return { ...l, reasoning: l.reasoning + event.data.text };
  }
  if (event.type === 'text-delta' && event.data.text) {
    return { ...l, status: null, text: l.text + event.data.text };
  }
  return l;
}

/** The narrator's persistent first-person line — italic, word-wrapped in full
 *  (narration can run to a short paragraph; truncating it defeats the point).
 *  Rendered above the typing indicator / streamed reply. */
export function NarrationLine({ text, className }: { text: string; className?: string }) {
  return (
    <p
      className={cn(
        'whitespace-pre-wrap break-words text-sm italic leading-relaxed text-muted-foreground',
        className,
      )}
    >
      {text}
    </p>
  );
}

/** The model's streamed reasoning behind a small collapsible — the same
 *  pattern as the owner assistant's ThinkingTrace, restyled standalone for the
 *  team surfaces. Collapsed by default; renders nothing without reasoning. */
export function ReasoningTrace({
  reasoning,
  className,
}: {
  reasoning: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = reasoning.trim();
  if (!text) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-left text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        <Sparkles className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="font-medium">Thinking</span>
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
      </button>
      {open && (
        <p className="mt-1.5 max-h-56 overflow-y-auto scrollbar-thin whitespace-pre-wrap break-words pl-5 text-xs leading-relaxed text-muted-foreground/75">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * The live region for a streaming turn — the one thing that made the assistant
 * unusable without sight.
 *
 * There WAS `sr-only` text saying who is doing what, but text that merely
 * exists is not text that is heard: nothing in the tree carried `aria-live`, so
 * a screen reader read it only if the user happened to navigate onto it, which
 * during a reply that is still arriving they have no reason to do. Nothing was
 * announced from the moment a turn was sent to the moment it finished.
 *
 * WHAT IS ANNOUNCED, AND WHAT DELIBERATELY IS NOT. The reply text changes once
 * per animation frame. Piping that into a live region would restart the
 * utterance on every frame, so a screen reader would stutter the same opening
 * words for the length of the turn and never reach the end — louder than
 * silence and less useful. So while the turn runs only the STEP is announced
 * ("Ada is searching your notes"), which changes a handful of times a turn and
 * is the part a sighted user is reading off the trail anyway. The reply is
 * announced once, whole, when it settles.
 *
 * The node is always mounted, never conditionally rendered. A live region that
 * appears at the same moment as its first message is a region several screen
 * readers never register, and the announcement is simply lost.
 */
export function TurnAnnouncer({
  name,
  status,
  reply,
  streaming,
}: {
  /** Who is replying, for the progress line. */
  name: string;
  /** The current step label, or null before the first one lands. */
  status: string | null;
  /** The streamed reply so far. Read, but not announced, until it settles. */
  reply: string;
  /** True for as long as the turn is in flight. */
  streaming: boolean;
}) {
  const [message, setMessage] = useState('');
  // The last non-empty buffer. Held in a ref because the turn's state is reset
  // the moment it settles — by the time the transition below is observed, the
  // reply prop may already be back to ''.
  const lastReply = useRef('');
  const wasStreaming = useRef(false);

  useEffect(() => {
    if (reply) lastReply.current = reply;
  }, [reply]);

  useEffect(() => {
    if (streaming) {
      wasStreaming.current = true;
      setMessage(status ? `${name} is ${status}` : '');
      return;
    }
    // Only report an ending for a turn this component actually saw begin —
    // otherwise every mount would announce a reply nobody asked for.
    if (!wasStreaming.current) return;
    wasStreaming.current = false;
    const text = lastReply.current;
    lastReply.current = '';
    setMessage(text || `${name} has replied.`);
  }, [streaming, status, name]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
