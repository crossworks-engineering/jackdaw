'use client';

/**
 * This module also held the team portal's live-turn state (the Team Chat and
 * Forum clients' shared SSE event router, with its narration and reasoning
 * atoms). That went with the portal (member logins Phase 6); chat, a member's
 * included, is the assistant dock now, and the announcer below is what is
 * left.
 */
import { useEffect, useRef, useState } from 'react';

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
