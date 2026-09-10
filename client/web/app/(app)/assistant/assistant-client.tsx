'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type ContextRef, useAssistantDock } from '@/components/assistant/assistant-dock';
import { useTurnStage } from '@/components/assistant/use-turn-stage';
import { type ThoughtEvent, useTurnStream } from '@/components/assistant/use-turn-stream';
import { TurnAnnouncer } from '@mantle/web-ui/live-turn';
import {
  ArtifactView,
  ChannelBadge,
  PromptCard,
  StoredAttachmentView,
} from './assistant-turn-parts';
import { buildContextPreamble, groupTurns } from './assistant-turns';
import type { Artifact, Message } from './assistant-turns';
import {
  SHARE_LOCATION_KEY,
  draftStorageKey,
  isNearBottom,
  mergeOlder,
  restoredScrollTop,
  wantsPreviewUrl,
} from './assistant-thread-state';
import { useVoiceInput } from './use-voice-input';
import { ThoughtTrail } from '@/components/assistant/thought-trail';
import { AiThinkingOrb } from '@/components/ai-thinking-orb';
import { LightboxImages } from '@/components/image-lightbox';
import {
  ArrowDown,
  CornerDownLeft,
  FileText,
  Highlighter,
  ListRestart,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Paperclip,
  Square,
  SquareDashedMousePointer,
  X,
} from 'lucide-react';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { agentAccent } from '@/lib/agent-color';
import { composerKeyAction } from '@/lib/composer-keys';
import { GeneratedAvatar } from '@mantle/web-ui/generated-avatar';
import { avatarPartsOf } from '@mantle/web-ui/avatar-parts';
import { RichText } from '@/components/assistant/rich-text';
import { ASSISTANT_TURN_MAX_CHARS, longMessageNoteTitle } from '@mantle/web-ui/assistant-limits';
import { CopyButton } from '@mantle/web-ui/copy-button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { assetUrl } from '@mantle/web-ui/asset-url';
import { fileRawSrc, mediaFileId } from '@mantle/content-core/markdown-refs';
import { COMPOSER_BAND_GRADIENT, COMPOSER_BOX } from '@mantle/web-ui/lib/composer-style';
import { uuid } from '@mantle/web-ui/lib/secure-context-fallbacks';
import { isTurnStreamingEnabledClient } from '@mantle/web-ui/turn-streaming';
import {
  canReplaceInFlightTurn,
  combineCorrectedPrompt,
} from '@/components/assistant/replace-turn';

/**
 * Image handling for the LIVE STREAM buffer (the lightweight ReactMarkdown
 * render; the durable reply below it goes through RichText/TipTap instead).
 *
 * Saskia places a stored picture with `![alt](media:<file-id>)`. ReactMarkdown
 * knows nothing of that scheme, so left alone it emits `<img src="media:…">`
 * and the browser paints a broken-image icon for the rest of the turn. Resolve
 * it to the same owner-gated bytes route RichText and the gallery use.
 *
 * A HALF-TYPED marker never reaches here at all: `![alt](media:` isn't a
 * complete markdown image, so it stays literal text until the closing paren
 * arrives, which is the quiet degradation we want mid-stream.
 */
const STREAM_MARKDOWN_COMPONENTS = {
  img: ({ src, alt }: { src?: string | Blob; alt?: string }) => {
    const href = typeof src === 'string' ? src : '';
    const nodeId = mediaFileId(href);
    // A media: id that doesn't resolve (model-invented, or another owner's)
    // 401s at the route and shows as a broken image, never as someone else's
    // picture. Same gate the durable render and the gallery sit behind.
    const resolved = nodeId ? assetUrl(fileRawSrc(nodeId)) : href;
    if (!resolved) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolved} alt={alt ?? ''} className="max-h-96 rounded-lg object-contain" />;
  },
};

/** Page size for the initial load and each scroll-up fetch. */
const PAGE_SIZE = 100;

/** Marked-block pills shown before the rest collapse behind a "+N more" expander. */
const MARK_PILL_LIMIT = 4;

export function AssistantClient({
  initialMessages,
  agentReady,
  agentSlug,
  agentName,
  agentAvatar,
}: {
  initialMessages: Message[];
  agentReady: boolean;
  /** Which agent the selector targets; sent with each turn. */
  agentSlug?: string;
  /** Display name of the active agent — drives the bubble avatar + greeting. */
  agentName?: string;
  /** Stored avatar for the active agent. Optional: with no record the avatar is
   *  seeded from the slug, so there is always one. */
  agentAvatar?: { style: string; seed: string } | null;
}) {
  // Per-agent visual identity: a stable colour + monogram so it's obvious
  // which agent you're talking to when you switch.
  const accent = agentAccent(agentSlug ?? 'assistant');
  // Turns run through the app-wide dock provider, so a long turn keeps going
  // (and stays visible in the floating dock) when you navigate away mid-answer.
  const {
    runTurn,
    busy: dockBusy,
    agentSlug: dockAgentSlug,
    panel,
    pendingContext,
    pinnedContext,
    extraDirective,
    surfaceSelection,
    removeContext,
    dismissPinnedContext,
    clearContext,
    startPicking,
  } = useAssistantDock();
  // Everything that rides this turn as context: the screen-pinned node (the open
  // page/table/app) PLUS any pick-mode chips, deduped. Pinned nodes survive a
  // send (they stay attached while you're on the screen); pick-mode chips clear.
  const pickedContext = useMemo(() => {
    const seen = new Set(pinnedContext.map((r) => r.id));
    return pendingContext.filter((r) => !seen.has(r.id));
  }, [pinnedContext, pendingContext]);
  const allContext = useMemo(
    () => [...pinnedContext, ...pickedContext],
    [pinnedContext, pickedContext],
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // The composer draft survives beyond this component's life: it's mirrored to
  // sessionStorage per agent, so an agent switch (which remounts this component
  // by design) or a reload brings your half-typed message back. Hydrated in an
  // effect (not the initializer) so SSR/hydration stay byte-identical.
  const draftKey = draftStorageKey(agentSlug);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) setDraft((cur) => (cur ? cur : saved));
    } catch {
      /* no storage — draft is session-memory only */
    }
    // Hydrate once per mount (the key is fixed for a mount — agent switches remount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(draftKey, draft);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* no storage */
    }
  }, [draft, draftKey]);
  const [sending, setSending] = useState(false);
  // Marked-block pills collapse past MARK_PILL_LIMIT; this expands the full set.
  // The list itself stays uncapped; the assistant still receives every mark.
  const [showAllMarks, setShowAllMarks] = useState(false);
  const markItems = surfaceSelection?.items ?? [];
  const visibleMarks = showAllMarks ? markItems : markItems.slice(0, MARK_PILL_LIMIT);
  const hiddenMarkCount = markItems.length - visibleMarks.length;
  // Drop stale expansion once the selection shrinks back under the limit
  // (per-pill removal or "Clear N marked").
  const markCount = markItems.length;
  useEffect(() => {
    if (markCount <= MARK_PILL_LIMIT) setShowAllMarks(false);
  }, [markCount]);
  // True from the moment the user hits Stop until the turn settles — so the Stop
  // button reflects "stopping…" and can't be double-fired.
  const [stopping, setStopping] = useState(false);
  // Live "what's the agent doing" label. The stream (keyed on the in-flight
  // turn's id) pushes status the instant each step starts; the poll is the
  // fallback while streaming is off or before the socket connects. Stream wins.
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const {
    label: streamLabel,
    trail: streamTrail,
    reply: streamReply,
    reasoning: streamReasoning,
    phase: streamPhase,
    outboundId: streamOutboundId,
    inboundId: streamInboundId,
    error: streamError,
    startedAt: streamStartedAt,
    tokens: streamTokens,
    tokensApprox: streamTokensApprox,
  } = useTurnStream(activeTurnId);
  // Non-blocking streaming on for this client build? Gates the whole
  // premature-Enter replace flow — blocking mode has no cancel primitive, so
  // there the composer stays disabled mid-turn exactly as before.
  const streamingOn = isTurnStreamingEnabledClient();
  const polledLabel = useTurnStage(sending);
  const stageLabel = streamLabel ?? polledLabel;
  // Live trail display mode (Settings → Profile). Fetched once on mount; the
  // trail renders 'list' (stacking, default) until it loads.
  const [trailMode, setTrailMode] = useState<'list' | 'replace'>('list');
  useEffect(() => {
    void apiFetch<{ preferences?: { thoughtTrailMode?: string } }>('/api/profile')
      .then((d) => {
        if (d.preferences?.thoughtTrailMode === 'replace') setTrailMode('replace');
      })
      .catch(() => {});
  }, []);
  // Mirror the live trail + the durable outbound id into refs so the completion
  // reconciler (which runs async, off the stream's `done`) reads fresh values
  // rather than stale closure captures.
  const trailRef = useRef<ThoughtEvent[]>([]);
  useEffect(() => {
    trailRef.current = streamTrail;
  }, [streamTrail]);
  const outboundIdRef = useRef<string | null>(null);
  useEffect(() => {
    outboundIdRef.current = streamOutboundId;
  }, [streamOutboundId]);
  // The durable inbound row id (also from turn-start) — the replace path needs
  // BOTH ids to stamp the cancelled pair superseded. Mirrored into a ref so the
  // brief post-Enter retry (turn-start may lag a sub-second correction) reads
  // the fresh value.
  const inboundIdRef = useRef<string | null>(null);
  useEffect(() => {
    inboundIdRef.current = streamInboundId;
  }, [streamInboundId]);
  // Mirror the final token count + the turn's start time so reconcileDone (async,
  // stable callback) can stamp the real "duration · tokens" onto the frozen trail.
  const streamTokensRef = useRef<number | null>(null);
  useEffect(() => {
    streamTokensRef.current = streamTokens;
  }, [streamTokens]);
  const streamStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    streamStartedAtRef.current = streamStartedAt;
  }, [streamStartedAt]);
  // The in-flight non-blocking turn awaiting reconciliation (set by `submit`
  // when the route returns 202; consumed by the phase effect on done/error).
  // `startedAt` lets the safety poll find the turn's outbound row even if the
  // `turn-start` event (which carries the id) was missed.
  const pendingTurnRef = useRef<{ optimisticId: string; turnId: string; startedAt: string } | null>(
    null,
  );
  const [error, setError] = useState<string>();
  // An over-long message that was parked in a note — shown as a normal (not
  // destructive) line with a link, so the user can open what was sent.
  const [notice, setNotice] = useState<{ id: string; title: string } | null>(null);
  // Closes the double-submit window while the offload's note POST is in flight
  // (the only await before `sending` flips true). Ref, not state — the guard
  // must be visible in the same tick the second Enter arrives.
  const parkingRef = useRef(false);
  // The note already created for an over-long text, keyed by the exact text —
  // a retry after a failed send (the catch restores the draft) reuses it
  // instead of minting a duplicate note per attempt.
  const parkedNoteRef = useRef<{ source: string; id: string; title: string } | null>(null);
  // ── Attachment state ──
  // The user picks one file at a time (image or document). Images get an
  // object-URL preview (revoked on clear/send so we don't leak); documents
  // render as a name/size chip with no preview URL.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The text of the in-flight turn's prompt, so a Stop can drop it back into the
  // composer for correction.
  const lastPromptRef = useRef('');
  // Set when a Stop restores the prompt — focus the composer once it re-enables
  // (the textarea is disabled while `sending`, so we can't focus immediately).
  const focusAfterStopRef = useRef(false);
  // ── Premature-Enter replace state (streaming mode only) ──
  // True while a replace's cancel round-trip is in flight — the thread lock
  // that keeps a triple-Enter from firing two supersedes for one turn.
  const supersedingRef = useRef(false);
  // Whether the in-flight turn carried a file. Replace combines text verbatim,
  // so an attachment turn keeps today's behaviour (a second Enter is a no-op).
  const lastTurnHadFileRef = useRef(false);

  // ── Follow-up suggestion chip ──
  // The suggester worker persists ONE proposed next question onto the finalized
  // outbound row's data, strictly after `done` (docs: fetch-after-done, never a
  // post-done SSE event). We fetch it with a few short retries once a turn
  // reconciles; 204s (toggle off / guards declined / not written yet) just mean
  // no chip. Empty composer + Enter sends it verbatim; ArrowRight loads it for
  // editing; X dismisses. Cleared on send/dismiss; an agent switch re-keys this
  // component, which resets it for free.
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // Bumped on every send/dismiss so an in-flight fetch for an older turn can
  // tell it's stale and drop its result instead of resurrecting the chip.
  const suggestionEpochRef = useRef(0);
  const dismissSuggestion = useCallback(() => {
    suggestionEpochRef.current += 1;
    setSuggestion(null);
  }, []);
  const fetchSuggestion = useCallback((outboundId: string) => {
    const epoch = ++suggestionEpochRef.current;
    setSuggestion(null);
    void (async () => {
      // ~1s, ~2.5s, ~4s after done; give up quietly at ~5s (a slow suggester
      // model that lands later is acceptable waste; it just never shows).
      for (const delay of [1000, 1500, 1500]) {
        await new Promise((r) => setTimeout(r, delay));
        if (suggestionEpochRef.current !== epoch) return;
        try {
          const res = await apiFetch<{ suggestion?: string }>(
            `/api/assistant/turn/${outboundId}/suggestion`,
            { cache: 'no-store' },
          );
          if (suggestionEpochRef.current !== epoch) return;
          const s = typeof res.suggestion === 'string' ? res.suggestion.trim() : '';
          if (s) {
            setSuggestion(s);
            return;
          }
        } catch {
          /* transient; retry on the next tick, or give up */
        }
      }
    })();
  }, []);

  // ── Share-location toggle ──
  // Sticky opt-in (persisted): when on, each send attaches a fresh browser
  // geolocation fix to the turn — the same `location` wire contract the companion
  // uses, so the agent gets an origin for "where am I" / routing. Off by default;
  // the browser owns the actual permission prompt. Geolocation needs a secure
  // context (HTTPS/localhost), which prod + dev both satisfy.
  const [shareLocation, setShareLocation] = useState(false);
  useEffect(() => {
    try {
      setShareLocation(localStorage.getItem(SHARE_LOCATION_KEY) === '1');
    } catch {
      /* private mode / no storage — default off */
    }
  }, []);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // Wraps the scroller's content; watched by a ResizeObserver so we can re-pin to
  // the bottom as the transcript's height settles after a scroll (see below).
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Stick-to-bottom autoscroll ──
  // Follow new content (a landing reply, streamed tokens, a growing trail) ONLY
  // while the user is parked at the bottom. The moment they scroll up to read, we
  // stop yanking them down and offer a jump-to-bottom button instead. `atBottom`
  // is a ref (the truth read by the scroll effects, no stale closures); `showJump`
  // is state (drives the button). A small threshold so a deliberate scroll-up
  // un-sticks but sub-pixel rounding doesn't.
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const jumpToBottom = useCallback(() => {
    atBottomRef.current = true;
    setShowJump(false);
    scrollToBottom(true);
  }, [scrollToBottom]);

  // ── Scroll-up lazy loading of older messages ──
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= PAGE_SIZE);
  const loadingRef = useRef(false);
  // Captured before a prepend so the layout effect can hold scroll position.
  const pendingPrepend = useRef<{ prevHeight: number; prevTop: number } | null>(null);

  const turns = useMemo(() => groupTurns(messages), [messages]);

  // Scroll management: after a prepend, restore position (no jump); otherwise pin
  // to the bottom ONLY when the user is parked there (initial load + a send force
  // `atBottom` true). A reply that lands while they've scrolled up doesn't yank
  // them — the jump button appears instead.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (pendingPrepend.current) {
      el.scrollTop = restoredScrollTop(pendingPrepend.current, el.scrollHeight);
      pendingPrepend.current = null;
    } else if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setShowJump(true);
    }
  }, [messages, sending]);

  // Follow live streaming content (the reply typing out, the trail growing) while
  // stuck to the bottom. Fires per token/step; a no-op once the user scrolls up.
  useLayoutEffect(() => {
    if (atBottomRef.current) scrollToBottom(false);
    else setShowJump(true);
  }, [streamReply, streamTrail, scrollToBottom]);

  // Re-pin to the bottom when the panel opens. The transcript warms in the
  // background while the overlay is display:none (so it's instant on open) — but
  // a hidden element has no scrollHeight, so the initial-load scroll-to-bottom
  // above ran as a no-op and left the scroller at the top of the lazy-loaded
  // history. Now that the subtree is visible (scrollHeight is real), land on the
  // latest message. Respects a deliberate scroll-up — a minimise→restore keeps
  // your spot — by only jumping when you were parked at the bottom.
  useLayoutEffect(() => {
    if (panel !== 'open') return;
    const el = scrollerRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    else setShowJump(true);
  }, [panel]);

  // Keep the latest message in view as the transcript's height *settles*. The
  // one-shot scroll-to-bottoms above all fire at a single instant — but the
  // height isn't stable then: reply bodies render through TipTap (which mounts
  // and applies its content asynchronously) and attachment / artifact images
  // carry no fixed dimensions, so each finishes laying out *after* the scroll
  // has already run. That late growth pushes the bottom down and strands the
  // scroller partway up the history — the "half scrolled" symptom, worst on
  // panel-open where everything that warmed under display:none unfolds at once.
  // A ResizeObserver re-pins on every height change, so we ride the content down
  // until it's done growing — but only while the user is parked at the bottom
  // (atBottomRef), so a deliberate scroll-up to read history is never yanked.
  // Setting scrollTop never resizes the observed node, so there's no feedback
  // loop. Lives for the component's life (re-created on the agent-switch remount).
  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const loadOlder = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    const el = scrollerRef.current;
    const oldest = messages[0];
    if (!el || !oldest) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    try {
      const qs = new URLSearchParams({ before: oldest.createdAt, limit: String(PAGE_SIZE) });
      if (agentSlug) qs.set('agent', agentSlug);
      const data = await apiFetch<{ messages: Message[] }>(
        `/api/assistant/messages?${qs.toString()}`,
        { cache: 'no-store' },
      );
      const { fresh, hasMore: more } = mergeOlder(messages, data.messages ?? [], PAGE_SIZE);
      if (!more) setHasMore(false);
      if (fresh.length > 0) {
        pendingPrepend.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
        setMessages((prev) => [...fresh, ...prev]);
      }
    } catch {
      // network blip — user can scroll up again to retry
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMore, messages, agentSlug]);

  // Pull any newly-persisted messages into the transcript — used when a turn
  // that this page didn't start finishes (e.g. you returned to /assistant while
  // a dock turn was still running). Dedupes by id, so it's a safe no-op when
  // there's nothing new.
  const syncLatest = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (agentSlug) qs.set('agent', agentSlug);
      const data = await apiFetch<{ messages: Message[] }>(
        `/api/assistant/messages?${qs.toString()}`,
        { cache: 'no-store' },
      );
      const latest = data.messages ?? [];
      setMessages((prev) => {
        // Merge by id: ADD rows we don't have, and UPDATE ones whose durable
        // fields changed (a 'pending' row finalizing to 'complete'/'failed' —
        // its text/status/error flip server-side). Client-only fields (live
        // `artifacts`, frozen `thoughts`, the optimistic local preview) are
        // preserved. Returns `prev` unchanged when nothing moved (safe no-op).
        const byId = new Map(prev.map((m) => [m.id, m]));
        let changed = false;
        for (const row of latest) {
          const existing = byId.get(row.id);
          if (!existing) {
            byId.set(row.id, row);
            changed = true;
          } else if (
            existing.text !== row.text ||
            existing.status !== row.status ||
            existing.error !== row.error ||
            existing.model !== row.model ||
            (existing.toolStats?.calls ?? 0) !== (row.toolStats?.calls ?? 0) ||
            !!existing.superseded !== !!row.superseded
          ) {
            byId.set(row.id, {
              ...existing,
              text: row.text,
              status: row.status,
              error: row.error,
              model: row.model,
              channel: row.channel ?? existing.channel,
              attachments: row.attachments ?? existing.attachments,
              ...(row.toolStats ? { toolStats: row.toolStats } : {}),
              ...(row.superseded ? { superseded: true } : {}),
            });
            changed = true;
          }
        }
        if (!changed) return prev;
        return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    } catch {
      /* network blip — the next turn or a reload will reconcile */
    }
  }, [agentSlug]);

  // ── Non-blocking turn completion ──
  // The streaming route returns 202 immediately; the live stream then drives the
  // reply, and these reconcile the transcript to the DURABLE row when the turn
  // ends (the streamed buffer was advisory). `done` → pull the canonical rows
  // and freeze the thought trail onto the reply; `error` → surface it. A short
  // safety poll backs them up in case the terminal event is missed (NOTIFY has
  // no backlog, so a reconnect mid-turn could drop it).
  const endActiveTurn = useCallback(() => {
    setSending(false);
    setStopping(false);
    setActiveTurnId(null);
    pendingTurnRef.current = null;
  }, []);

  // Stop the in-flight turn: ask the runner to abort generation. The turn then
  // finalizes with whatever partial reply streamed and fires `done`, so the
  // normal completion path (phase effect / safety poll) reconciles it — no
  // special teardown here. Fire-and-forget; a dropped cancel just means the turn
  // runs a little longer.
  const stopTurn = useCallback(() => {
    const turnId = activeTurnId;
    if (!turnId || stopping) return;
    setStopping(true);
    void apiFetch(`/api/assistant/turn/${turnId}/cancel`, { method: 'POST' }).catch(() => {
      /* the done/poll path still reconciles; nothing to surface */
    });
    // Drop the stopped turn's prompt back into the composer so the user can
    // correct it and resend. Only when the box is empty — if they'd started
    // typing the next message while this one streamed, don't clobber it.
    const prompt = lastPromptRef.current;
    if (prompt) {
      setDraft((cur) => (cur.trim() ? cur : prompt));
      focusAfterStopRef.current = true; // focus once the turn settles + box re-enables
    }
  }, [activeTurnId, stopping]);

  // After a Stop restores the prompt, focus the composer + cursor-to-end the
  // moment the turn settles (the box is disabled while `sending`).
  useEffect(() => {
    if (sending || !focusAfterStopRef.current) return;
    focusAfterStopRef.current = false;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [sending]);

  const reconcileDone = useCallback(
    async (optimisticId: string) => {
      const trail = trailRef.current;
      const outboundId = outboundIdRef.current;
      if (outboundId) fetchSuggestion(outboundId);
      const tokens = streamTokensRef.current;
      const startedAt = streamStartedAtRef.current;
      const durationMs = startedAt != null ? Date.now() - startedAt : undefined;
      await syncLatest(); // pulls the canonical inbound + (now 'complete') outbound
      setMessages((prev) => {
        // Drop the optimistic user bubble (the canonical inbound is now present),
        // and freeze the live thought trail (+ its duration / token total) onto
        // the durable outbound row.
        let next = prev.filter((m) => m.id !== optimisticId);
        if (outboundId && trail.length) {
          next = next.map((m) =>
            m.id === outboundId && !m.thoughts
              ? {
                  ...m,
                  thoughts: [...trail],
                  ...(tokens != null && tokens > 0 ? { tokens } : {}),
                  ...(durationMs != null ? { durationMs } : {}),
                }
              : m,
          );
        }
        return next;
      });
      endActiveTurn();
    },
    [syncLatest, endActiveTurn, fetchSuggestion],
  );

  const failActiveTurn = useCallback(
    (optimisticId: string, message: string) => {
      setError(message);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      endActiveTurn();
    },
    [endActiveTurn],
  );

  // React to the live terminal events for the in-flight non-blocking turn.
  useEffect(() => {
    const pending = pendingTurnRef.current;
    if (!pending) return;
    if (streamPhase === 'done') {
      void reconcileDone(pending.optimisticId);
    } else if (streamPhase === 'error') {
      failActiveTurn(pending.optimisticId, streamError ?? 'The turn failed.');
    }
  }, [streamPhase, streamError, reconcileDone, failActiveTurn]);

  // Safety net: if no terminal event arrives (a dropped reconnect), poll the
  // durable rows. Once the in-flight turn's outbound row reports a terminal
  // status, reconcile the same way the stream would have. Only runs while a
  // non-blocking turn is in flight; stops the moment it settles.
  useEffect(() => {
    if (!sending || !pendingTurnRef.current) return;
    let stopped = false;
    const tick = async () => {
      const pending = pendingTurnRef.current;
      if (stopped || !pending) return;
      try {
        const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (agentSlug) qs.set('agent', agentSlug);
        const data = await apiFetch<{ messages: Message[] }>(
          `/api/assistant/messages?${qs.toString()}`,
          { cache: 'no-store' },
        );
        const outboundId = outboundIdRef.current;
        const rows = data.messages ?? [];
        // Prefer the exact row id (from turn-start); fall back to the newest
        // outbound row created at/after this turn started, so a missed
        // turn-start can't leave the turn hung.
        const row = outboundId
          ? rows.find((m) => m.id === outboundId && m.direction === 'outbound')
          : rows
              .filter((m) => m.direction === 'outbound' && m.createdAt >= pending.startedAt)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .pop();
        if (stopped || !pendingTurnRef.current) return;
        if (row?.status === 'complete') void reconcileDone(pending.optimisticId);
        else if (row?.status === 'failed')
          failActiveTurn(pending.optimisticId, row.error ?? 'The turn failed.');
      } catch {
        /* transient — try again next tick */
      }
    };
    // First poll after a grace period (the stream usually wins), then every 3s.
    const t = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [sending, agentSlug, reconcileDone, failActiveTurn]);

  // A turn for THIS agent is running that this page didn't start (you navigated
  // back mid-flight, or it's a dock reply). Drives a "working" indicator, and
  // when it finishes we pull the reply in so the transcript updates without a
  // manual reload.
  const foreignBusy = dockBusy && !sending && dockAgentSlug === agentSlug;
  const prevForeignRef = useRef(false);
  useEffect(() => {
    if (prevForeignRef.current && !foreignBusy) void syncLatest();
    prevForeignRef.current = foreignBusy;
  }, [foreignBusy, syncLatest]);

  // On (re)mount — including an agent switch, which re-keys this component —
  // pull the latest persisted messages, so a reply that landed while you were
  // away shows up even if the router served this view from cache.
  useEffect(() => {
    void syncLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = isNearBottom(el);
    atBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
    if (el.scrollTop < 120) void loadOlder();
  }, [loadOlder]);

  const clearAttachment = () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
    setAttachedFile(null);
    setAttachedPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFilePicked = (file: File | null) => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
    setAttachedFile(file);
    // Only images get an inline object-URL preview; documents show a chip.
    setAttachedPreviewUrl(wantsPreviewUrl(file) ? URL.createObjectURL(file) : null);
  };

  // Read one browser geolocation fix and map it onto the `location` wire shape
  // (LocationPing) the turn route already sanitises. Resolves undefined on any
  // failure (denied / unavailable / timeout) so a turn never blocks on it.
  const getBrowserLocation = useCallback((): Promise<Record<string, unknown> | undefined> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = pos.coords;
          resolve({
            latitude: c.latitude,
            longitude: c.longitude,
            accuracy: c.accuracy,
            altitude: c.altitude,
            altitudeAccuracy: c.altitudeAccuracy,
            heading: c.heading,
            speed: c.speed,
            source: 'network', // browser geolocation — never GPS-grade; skill caveats accuracy
            timestamp: new Date(pos.timestamp).toISOString(),
          });
        },
        () => resolve(undefined),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }, []);

  // Toggle the sticky opt-in. Turning it ON triggers the browser permission
  // prompt up-front so denial surfaces now rather than silently at send time.
  const toggleShareLocation = useCallback(async () => {
    if (shareLocation) {
      setShareLocation(false);
      try {
        localStorage.setItem(SHARE_LOCATION_KEY, '0');
      } catch {
        /* no storage */
      }
      return;
    }
    const fix = await getBrowserLocation();
    if (!fix) {
      setError(
        'Could not get your location — allow location access for this site, then try again.',
      );
      return;
    }
    setShareLocation(true);
    try {
      localStorage.setItem(SHARE_LOCATION_KEY, '1');
    } catch {
      /* no storage */
    }
  }, [shareLocation, getBrowserLocation]);

  // `textOverride` is the suggestion-chip path: Enter on an EMPTY composer
  // sends the proposed follow-up verbatim (setDraft-then-submit would read the
  // stale draft). Everything else about the turn is identical.
  const submit = async (e: { preventDefault(): void }, textOverride?: string) => {
    e.preventDefault();
    // `let`: the replace path below folds the original prompt into a combined
    // correction turn by reassigning this.
    let text = (textOverride ?? draft).trim();
    // What the user actually typed. A failed send must never destroy it —
    // the composer is cleared optimistically below, and restored in the catch.
    const typedAtSend = text;
    // Allow attachment-only submits — the API route fills in a default
    // prompt server-side when text is empty.
    if ((!text && !attachedFile) || supersedingRef.current) return;

    // Idempotency key for this submit — lets the server replay (not re-run)
    // the turn if the request is retried, so we never get duplicate file
    // nodes / turns. Minted up front: the replace path below also stamps it
    // onto the cancelled pair as `superseded_by`, and the two must agree.
    const idempotencyKey = uuid();

    if (sending) {
      // A turn is already in flight. In streaming mode, a second Enter on a
      // text-only pair becomes a REPLACE: stop the old turn, stamp its pair
      // superseded, and fall through to send original + correction as one
      // combined turn. Anywhere the gate fails, keep today's no-op.
      if (
        !canReplaceInFlightTurn({
          streamingOn,
          sending,
          stopping,
          activeTurnId,
          hasAttachment: attachedFile != null,
          lastTurnHadFile: lastTurnHadFileRef.current,
        })
      ) {
        return;
      }
      // The durable row ids ride the turn-start event; a sub-second correction
      // can beat it. One brief retry, then degrade to the old no-op (the draft
      // stays put — the user can hit Enter again).
      let inboundId = inboundIdRef.current;
      let outboundId = outboundIdRef.current;
      if (!inboundId || !outboundId) {
        await new Promise((r) => setTimeout(r, 300));
        inboundId = inboundIdRef.current;
        outboundId = outboundIdRef.current;
      }
      if (!inboundId || !outboundId) return;
      const turnToCancel = activeTurnId;
      supersedingRef.current = true;
      try {
        // AWAIT the stamping cancel before sending the combined turn — this
        // ordering is the race fix (see the cancel route): the pair is marked
        // superseded before the new turn's context load can run, regardless of
        // when the old turn's finalize lands.
        await apiFetch(`/api/assistant/turn/${turnToCancel}/cancel`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            supersede: { inboundId, outboundId, newTurnId: idempotencyKey },
          }),
        });
      } catch (err) {
        // The old turn is still running untouched — surface it, keep the draft.
        supersedingRef.current = false;
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      supersedingRef.current = false;
      // Reflect the supersede locally: drop the old optimistic bubble (the
      // durable pair reappears dimmed via syncLatest once it finalizes) and
      // mark any already-merged pair rows. Ending the old turn's stream below
      // also clears the streamed partial from the typing branch.
      const oldOptimisticId = pendingTurnRef.current?.optimisticId;
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== oldOptimisticId)
          .map((m) => (m.id === inboundId || m.id === outboundId ? { ...m, superseded: true } : m)),
      );
      pendingTurnRef.current = null;
      setActiveTurnId(null);
      setStopping(false);
      text = combineCorrectedPrompt(lastPromptRef.current, text);
    }

    setError(undefined);
    setNotice(null);
    // Remember this turn's prompt so a Stop can drop it back into the composer.
    lastPromptRef.current = text;

    // Context — the screen-pinned node + any picked nodes ride along as a
    // reference preamble appended to the SENT text (the bubble still shows what
    // was typed). The agent reads them with its tools (file_read / page_get / …).
    // A surface focus directive (Pages marks, the Apps inspect region) follows,
    // so the specialist narrows the same way the old in-screen panels did.
    const compose = (body: string, picked: ContextRef[]) =>
      body +
      buildContextPreamble(pinnedContext, picked) +
      (extraDirective ? `\n\n${extraDirective}` : '');

    let sentText = compose(text, pickedContext);

    // Over the route's ceiling, the turn would 400 and the paste would be gone.
    // Park the body in a note instead and send a short stand-in that carries the
    // note as attached context — the agent reads it whole with `note_get`, and
    // the user keeps a durable copy they can open. Runs BEFORE the draft is
    // cleared, so a failure here leaves everything they typed in the box.
    if (sentText.length > ASSISTANT_TURN_MAX_CHARS) {
      // The note POST is the only await before the composer locks (`sending` is
      // still false, the box still full) — without this guard a second Enter
      // during the round-trip would mint a second idempotency key and run a
      // whole second turn. Synchronous ref, not state: it must close the window
      // in the SAME tick.
      if (parkingRef.current) return;
      parkingRef.current = true;
      try {
        // Re-sending the same text (after a failed turn, or a premature Enter)
        // reuses the note already parked for it instead of minting a duplicate.
        let parked = parkedNoteRef.current?.source === text ? parkedNoteRef.current : null;
        if (!parked) {
          const title = longMessageNoteTitle(text);
          const res = await apiSend<{ note: { id: string } }>('/api/notes', 'POST', {
            title,
            content: text,
            tags: ['long-message'],
          }).catch(() => null);
          if (!res?.note?.id) {
            setError(
              `That message is ${text.length.toLocaleString()} characters — over the ` +
                `${ASSISTANT_TURN_MAX_CHARS.toLocaleString()} limit for one turn — and saving it as a ` +
                'note failed, so nothing was sent. Your text is still in the box; try again or shorten it.',
            );
            return;
          }
          parked = { source: text, id: res.note.id, title };
          parkedNoteRef.current = parked;
        }
        const standIn =
          `My message was too long to send in one turn (${text.length.toLocaleString()} characters), ` +
          `so I saved it as the attached note "${parked.title}". Read it in full before replying.`;
        const offloaded = compose(standIn, [
          ...pickedContext,
          { id: parked.id, kind: 'note', label: parked.title },
        ]);
        // The gate measured the COMPOSED text, so shrinking the body may not be
        // enough — a huge context preamble/focus directive can still exceed the
        // ceiling, and sending would 400 with the note already written.
        if (offloaded.length > ASSISTANT_TURN_MAX_CHARS) {
          setError(
            'The attached context alone exceeds the send limit — remove some attached items ' +
              'or marks and try again. Your text is still in the box.',
          );
          return;
        }
        setNotice({ id: parked.id, title: parked.title });
        text = standIn;
        sentText = offloaded;
      } finally {
        parkingRef.current = false;
      }
    }

    const hasFile = attachedFile != null;
    const isImage = hasFile && attachedFile.type.startsWith('image/');
    // Whether THIS turn carries a file — read by a replace attempt while the
    // turn streams (attachment turns keep today's behaviour).
    lastTurnHadFileRef.current = hasFile;
    const optimisticId = `pending-${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      direction: 'inbound',
      text: text || (hasFile ? `📎 ${attachedFile.name}` : ''),
      createdAt: new Date().toISOString(),
      // Show the local image preview immediately so the user sees what
      // they sent without waiting for the round-trip. Documents have no
      // inline preview — their name rides in the text above.
      ...(isImage && attachedPreviewUrl
        ? {
            artifacts: [
              {
                kind: 'image' as const,
                mimeType: attachedFile.type,
                base64: '', // optimistic — use the local object URL
                caption: attachedFile.name,
                producedBy: 'assistant-upload',
                localPreviewUrl: attachedPreviewUrl,
              },
            ],
          }
        : {}),
      pending: true,
    };
    // A send always re-sticks to the bottom — the user wants to watch their own
    // message + the reply, even if they'd scrolled up to read history.
    atBottomRef.current = true;
    setShowJump(false);
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    // This turn supersedes any follow-up chip (accepted or ignored alike).
    dismissSuggestion();
    // Open the live status stream for this turn (same uuid the server keys it
    // on) the instant we start — before the POST — so we catch the early steps.
    setActiveTurnId(idempotencyKey);
    setSending(true);

    try {
      // Build the body, then run the turn through the app-wide dock provider so
      // the fetch lives in the persistent shell (survives navigation) and drives
      // the floating mini-chat. Multipart for uploads (streams raw, no base64
      // bloat); JSON for text-only.
      // Best-effort fresh location fix when sharing is on — rides on the turn as
      // the `location` field (JSON) or form field (multipart), same as mobile.
      const location = shareLocation ? await getBrowserLocation() : undefined;
      let body: FormData | string;
      let isJson: boolean;
      if (hasFile) {
        const formData = new FormData();
        if (sentText) formData.set('text', sentText);
        if (agentSlug) formData.set('agentSlug', agentSlug);
        formData.set(isImage ? 'image' : 'file', attachedFile);
        if (location) formData.set('location', JSON.stringify(location));
        body = formData;
        isJson = false;
      } else {
        body = JSON.stringify({ text: sentText, agentSlug, ...(location ? { location } : {}) });
        isJson = true;
      }
      type BlockingTurn = {
        inbound: { id: string; text: string; createdAt: string; artifacts?: Artifact[] };
        outbound: { id: string; text: string; model: string | null; createdAt: string };
        artifacts?: Artifact[];
        warnings?: string[];
      };
      type NonBlockingTurn = { turnId: string; warnings?: string[] };
      const data = (await runTurn({
        agentSlug,
        agentName: agentName ?? 'Assistant',
        idempotencyKey,
        displayText: optimistic.text,
        body,
        isJson,
      })) as BlockingTurn | NonBlockingTurn;

      // The send was accepted — clear the composer attachment either way. Reset
      // WITHOUT revoking the object URL: it now backs the sent bubble's preview
      // (revoking would blank it); it's released on the next page load.
      setAttachedFile(null);
      setAttachedPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // The marked context went out with this turn — clear the chips.
      clearContext();

      if ('outbound' in data) {
        // BLOCKING result (streaming off): the full reply is already here — swap
        // the optimistic rows for the durable ones now and end the turn.
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          {
            id: data.inbound.id,
            direction: 'inbound',
            text: data.inbound.text,
            createdAt: data.inbound.createdAt,
            // Keep the optimistic artifacts (local object-URL preview) — the
            // server no longer echoes the image base64 back, so the browser
            // renders from the bytes it already has.
            artifacts: optimistic.artifacts ?? data.inbound.artifacts ?? [],
          },
          {
            id: data.outbound.id,
            direction: 'outbound',
            text: data.outbound.text,
            model: data.outbound.model,
            createdAt: data.outbound.createdAt,
            status: 'complete',
            artifacts: data.artifacts ?? [],
            // Freeze the live status trail onto the reply as a persistent record.
            ...(trailRef.current.length ? { thoughts: [...trailRef.current] } : {}),
          },
        ]);
        if (data.warnings?.length) setError(data.warnings.join(' · '));
        setSending(false);
        setActiveTurnId(null);
        // Blocking path finalizes the same durable row, so the suggestion (if
        // the agent's toggle is on) lands there too, so fetch it the same way.
        fetchSuggestion(data.outbound.id);
      } else {
        // NON-BLOCKING (202): the live stream now types the reply out; the phase
        // effect (and the safety poll) reconcile to the durable row on
        // done/error. Hand them the turn — keep the optimistic bubble + spinner.
        pendingTurnRef.current = {
          optimisticId,
          turnId: idempotencyKey,
          startedAt: optimistic.createdAt,
        };
        if (data.warnings?.length) setError(data.warnings.join(' · '));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // A failed turn must not leave the offload's success line standing — the
      // error and "saved as a note and attached" would render stacked, each
      // contradicting the other. (The parked note itself is kept and reused on
      // the retry via parkedNoteRef.)
      setNotice(null);
      // Put the text back. The composer is cleared optimistically at send time,
      // so without this a rejected turn silently destroys whatever was typed —
      // which is exactly how a long paste came to vanish with no trace anywhere.
      // Only when the box is still empty, so a fresh draft is never clobbered.
      setDraft((cur) => (cur.trim() ? cur : typedAtSend));
      // Drop the optimistic row on error so the user can retry without dupes.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setSending(false);
      setStopping(false);
      setActiveTurnId(null);
      pendingTurnRef.current = null;
    }
  };

  // ── Mic recording ──
  // The whole capture→transcript cluster lives in use-voice-input.ts; this
  // screen only says where the words land and where an error shows.
  const appendTranscript = useCallback((text: string) => {
    setDraft((prev) => (prev ? `${prev} ${text}` : text));
  }, []);
  const {
    recording,
    transcribing,
    start: startRecording,
    stop: stopRecording,
  } = useVoiceInput({ onTranscript: appendTranscript, onError: setError });

  const lastTurnId = turns[turns.length - 1]?.id;

  // The premature-Enter replace affordance: while a text-only turn streams and
  // the user has typed a correction, the send slot becomes a "stop and resend"
  // button (and Enter triggers it). Structurally impossible in blocking mode —
  // `streamingOn` gates the whole thing. Reading `lastTurnHadFileRef` in render
  // is safe: it's set synchronously in submit, before the `sending` re-render.
  const replaceEligible = canReplaceInFlightTurn({
    streamingOn,
    sending,
    stopping,
    activeTurnId,
    hasAttachment: attachedFile != null,
    lastTurnHadFile: lastTurnHadFileRef.current,
  });
  const showReplace = replaceEligible && draft.trim().length > 0;

  // The transcript, held still while the composer types.
  //
  // `draft` lives in this same component, so every keystroke re-rendered the
  // whole list — and each row carries a rich-text editor, so that is the
  // expensive kind of re-render. Nothing in here reads the draft, so memoising
  // the element keeps React from walking it on a keystroke. It still rebuilds
  // when the conversation actually changes, streamReply included — that one is
  // now coalesced to one commit per frame by use-turn-stream.
  const transcript = useMemo(
    () => (
      <ul className="mx-auto flex max-w-5xl flex-col">
        {turns.map((turn, idx) => {
          const isLast = turn.id === lastTurnId;
          const showTyping = isLast && sending && !turn.response;
          // A superseded pair (cancelled + re-sent with a correction)
          // stays visible but dimmed, tagged "replaced" on the prompt
          // card — a truthful record the model no longer sees.
          const replaced = !!(turn.prompt?.superseded || turn.response?.superseded);
          return (
            <li
              key={turn.id}
              className={
                'group/turn grid gap-x-10 gap-y-3 pb-10 @3xl/thread:grid-cols-[minmax(0,1fr)_300px]' +
                // A thin divider between turns, in the agent's accent
                // colour (the accent moved here from the old left border).
                (idx > 0 ? ' border-t pt-10' : '') +
                (replaced ? ' opacity-60' : '')
              }
              style={
                idx > 0
                  ? {
                      borderTopColor: `color-mix(in oklab, ${accent.border} 20%, transparent)`,
                    }
                  : undefined
              }
            >
              {/* RIGHT MARGIN (DOM-first so it stacks above the
                        response on mobile): the user's prompt, anchored
                        beside the response it produced. */}
              <div className="@3xl/thread:col-start-2 @3xl/thread:row-start-1">
                {turn.prompt && <PromptCard message={turn.prompt} />}
              </div>

              {/* MAIN CANVAS: Saskia's reply as a rich document. */}
              <div className="min-w-0 @3xl/thread:col-start-1 @3xl/thread:row-start-1">
                {turn.response ? (
                  turn.response.status === 'failed' ? (
                    // Durable failed turn (reloaded after an error).
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive-ink">
                      <span>{turn.response.error || 'This turn failed.'}</span>
                    </div>
                  ) : turn.response.status === 'pending' ? (
                    // Durable pending turn (reloaded mid-flight) — the runner
                    // is still working; show the bare thinking orb (no bubble:
                    // a tinted background behind the orb reads as a stray card).
                    <div className="inline-flex items-center gap-2 py-2">
                      <AiThinkingOrb className="shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        {agentName ?? 'Assistant'} is working…
                      </span>
                    </div>
                  ) : (
                    <article>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">
                          {agentName ?? 'Assistant'}
                        </span>
                        <ChannelBadge channel={turn.response.channel} />
                      </div>
                      {turn.response.thoughts && turn.response.thoughts.length > 0 && (
                        <ThoughtTrail
                          steps={turn.response.thoughts}
                          tokens={turn.response.tokens ?? null}
                          durationMs={turn.response.durationMs ?? null}
                          timestamp={turn.response.createdAt}
                          className="mb-3 max-w-xl"
                        />
                      )}
                      <div>
                        <RichText markdown={turn.response.text} />
                        {turn.response.attachments && turn.response.attachments.length > 0 && (
                          <div className="mt-3 flex flex-col gap-2">
                            {turn.response.attachments.map((a, i) => (
                              <StoredAttachmentView key={`${turn.id}-att-${i}`} attachment={a} />
                            ))}
                          </div>
                        )}
                        {turn.response.artifacts && turn.response.artifacts.length > 0 && (
                          <div className="mt-3 flex flex-col gap-2">
                            {turn.response.artifacts.map((a, i) => (
                              <ArtifactView key={`${turn.id}-art-${i}`} artifact={a} />
                            ))}
                          </div>
                        )}
                        {turn.response.toolStats && turn.response.toolStats.failed > 0 && (
                          // Always visible (not hover-gated): the runtime's own
                          // ledger says some calls failed, and the reply may not
                          // admit it. Tooltip lists the failed slugs + errors.
                          <p
                            className="mt-1.5 text-[10px] text-destructive-ink"
                            title={turn.response.toolStats.failures
                              .map((f) => `${f.slug}: ${f.error}`)
                              .join('\n')}
                          >
                            {turn.response.toolStats.failed} of {turn.response.toolStats.calls} tool
                            call
                            {turn.response.toolStats.calls === 1 ? '' : 's'} failed this turn
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center justify-between gap-2 pointer-events-none opacity-0 transition-opacity group-hover/turn:pointer-events-auto group-hover/turn:opacity-100">
                          <div className="flex items-baseline gap-2 text-[10px] text-muted-foreground">
                            <span title={formatDateTime(turn.response.createdAt)}>
                              {new Date(turn.response.createdAt).toLocaleTimeString()}
                            </span>
                            {turn.response.model && (
                              <code className="font-mono">{turn.response.model}</code>
                            )}
                            {turn.response.toolStats && (
                              <span
                                title={
                                  `${turn.response.toolStats.succeeded} succeeded` +
                                  (turn.response.toolStats.queued > 0
                                    ? ` · ${turn.response.toolStats.queued} awaiting approval`
                                    : '') +
                                  (turn.response.toolStats.skipped > 0
                                    ? ` · ${turn.response.toolStats.skipped} not run (guards or Stop)`
                                    : '')
                                }
                              >
                                {turn.response.toolStats.calls} tool call
                                {turn.response.toolStats.calls === 1 ? '' : 's'}
                                {turn.response.toolStats.queued > 0 &&
                                  ` · ${turn.response.toolStats.queued} awaiting approval`}
                              </span>
                            )}
                          </div>
                          <CopyButton text={turn.response.text} />
                        </div>
                      </div>
                    </article>
                  )
                ) : showTyping ? (
                  // Once status events arrive, the thinking orb gives way to
                  // the live thought trail building in place, and — when
                  // token streaming is on — the reply itself typing out
                  // below it. Before any of that (or on the poll fallback)
                  // keep the thinking orb. The streamed reply is advisory:
                  // when the durable turn.response lands above, this whole
                  // branch is replaced by the authoritative <article>.
                  streamTrail.length > 0 || streamReply ? (
                    // aria-busy marks the subtree as still arriving, so a
                    // screen reader treats a half-written reply as in flux
                    // rather than as the finished answer. The sr-only line
                    // stays for anyone who navigates INTO the turn; what gets
                    // announced without navigating is TurnAnnouncer's job.
                    <div className="max-w-xl" aria-busy={streamPhase === 'streaming'}>
                      <span className="sr-only">
                        {agentName ?? 'Assistant'} is {stageLabel ?? 'typing'}
                      </span>
                      {streamTrail.length > 0 && (
                        <ThoughtTrail
                          steps={streamTrail}
                          live
                          mode={trailMode}
                          startedAt={streamStartedAt}
                          tokens={streamTokens}
                          tokensApprox={streamTokensApprox}
                          reasoning={streamReasoning}
                        />
                      )}
                      {streamReply && (
                        // Live buffer: a lightweight ReactMarkdown render, NOT the
                        // TipTap RichText editor — the editor's setContent() runs
                        // flushSync and collides with React mid-render when the buffer
                        // changes every token. The durable reply below swaps in RichText.
                        <div
                          className={`prose dark:prose-invert max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0 ${
                            streamTrail.length > 0 ? 'mt-3' : ''
                          }`}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={STREAM_MARKDOWN_COMPONENTS}
                          >
                            {streamReply}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 py-2">
                      <span className="sr-only">
                        {agentName ?? 'Assistant'} is {stageLabel ?? 'typing'}
                      </span>
                      <AiThinkingOrb label={stageLabel} className="shrink-0" />
                      {stageLabel && (
                        <span className="text-xs text-muted-foreground" aria-hidden>
                          {stageLabel}
                        </span>
                      )}
                    </div>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
        {foreignBusy && (
          <li className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
            <AiThinkingOrb className="shrink-0" />
            {agentName ?? 'Assistant'} is working… (started elsewhere)
          </li>
        )}
      </ul>
    ),
    [
      accent.border,
      agentName,
      foreignBusy,
      lastTurnId,
      sending,
      stageLabel,
      streamReasoning,
      streamReply,
      // Phase changes a handful of times a turn (idle → streaming → done), not
      // per frame, so keeping the transcript honest about aria-busy does not
      // undo v0.6.50's memoisation.
      streamPhase,
      streamStartedAt,
      streamTokens,
      streamTokensApprox,
      streamTrail,
      trailMode,
      turns,
    ],
  );

  return (
    <>
      {/* Always mounted, outside the memoised transcript: a live region that
          appears with its first message is one several screen readers never
          register. See TurnAnnouncer for what it does and does not announce. */}
      <TurnAnnouncer
        name={agentName ?? 'Assistant'}
        status={stageLabel}
        reply={streamReply}
        streaming={sending || streamPhase === 'streaming'}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* @container/thread: the turn layout (prompt-in-the-margin two-column
          grid) keys off THIS pane's width, not the viewport — so the docked
          side column stacks prompts above responses while the full overlay
          keeps the margin layout. */}
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="@container/thread min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 py-6"
        >
          {/* Click any inline image → fullscreen zoomable viewer. */}
          <LightboxImages containerRef={scrollerRef} />
          {/* Height-tracking wrapper: the ResizeObserver above watches this node so
            late content growth (TipTap reply bodies, images loading in) re-pins
            the scroll to the bottom instead of stranding it mid-thread. */}
          <div ref={contentRef}>
            {turns.length === 0 ? (
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
                <GeneratedAvatar
                  seed={agentAvatar?.seed || agentSlug || 'assistant'}
                  parts={avatarPartsOf(agentAvatar)}
                  size={48}
                  className="ring-2"
                  containerStyle={{ '--tw-ring-color': accent.border } as React.CSSProperties}
                />
                <p className="text-sm text-muted-foreground">
                  No messages yet. Say hi to{' '}
                  <span className="font-medium text-foreground">
                    {agentName ?? 'your assistant'}
                  </span>
                  .
                </p>
              </div>
            ) : (
              <>
                {loadingOlder && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                  </div>
                )}
                {!hasMore && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    Beginning of the conversation
                  </p>
                )}
                {transcript}
              </>
            )}
          </div>
        </div>
        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label="Jump to latest"
            className="absolute bottom-4 left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowDown className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <form
        onSubmit={submit}
        // Brand-tinted gradient rising from the edge — one definition shared
        // with the Team Chat composer (lib/composer-style).
        className={`border-t border-border ${COMPOSER_BAND_GRADIENT} px-6 py-4`}
      >
        {/* The composer spans the full conversation width (max-w-5xl) — the same
            box the turns occupy above (response column + prompt margin) — rather
            than only the response column. */}
        <div className="mx-auto max-w-5xl">
          <div className="space-y-2">
            {/* Attachment preview — shown above the input row so the
                user sees what they're about to send. Persists across
                keystrokes and clears on send/dismiss. */}
            {attachedFile && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                {attachedPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachedPreviewUrl}
                    alt={attachedFile.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-background/60 text-muted-foreground">
                    <FileText className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 text-xs">
                  <div className="font-medium">{attachedFile.name}</div>
                  <div className="text-muted-foreground">
                    {attachedFile.type || 'file'} · {(attachedFile.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearAttachment}
                  className="rounded p-1 text-muted-foreground hover:bg-background/60"
                  title="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {/* Context chips. The screen-pinned node (the open page/table/app)
                shows first with a pin glyph and a distinct fill — it's managed
                by the screen and rides every turn. It DOES render a remove: the
                `X` dismisses it for this chat, which is how you ask a general
                question without leaving the screen. Focused-section chips (the
                Pages gutter marks, with a snippet of each marked block) follow,
                so it's unambiguous the assistant sees exactly what you selected.
                Pick-mode chips come last and clear after a send. */}
            {(allContext.length > 0 || (surfaceSelection?.items.length ?? 0) > 0) && (
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto scrollbar-thin">
                {allContext.map((c) => {
                  const pinned = pinnedContext.some((r) => r.id === c.id);
                  return (
                    <span
                      key={c.id}
                      className={
                        'inline-flex max-w-[16rem] items-center gap-1.5 rounded-md border py-1 pl-2 pr-1 text-xs ' +
                        (pinned
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-border bg-muted/40')
                      }
                      title={
                        pinned
                          ? 'On this screen — sent with every message. Remove to ask a general question.'
                          : undefined
                      }
                    >
                      {pinned ? (
                        <MapPin className="size-3.5 shrink-0 text-primary-ink" aria-hidden />
                      ) : (
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="truncate font-medium">{c.label}</span>
                      <button
                        type="button"
                        onClick={() => (pinned ? dismissPinnedContext(c.id) : removeContext(c.id))}
                        className="rounded p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        title={pinned ? 'Remove from this chat' : 'Remove'}
                        aria-label={`Remove ${c.label}`}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  );
                })}
                {visibleMarks.map((s) => (
                  <span
                    key={`focus-${s.id}`}
                    className={
                      'inline-flex max-w-[16rem] items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 py-1 pl-2 text-xs text-foreground ' +
                      (surfaceSelection?.onRemove ? 'pr-1' : 'pr-2')
                    }
                    title={`Focused ${surfaceSelection?.noun} — the assistant will work on exactly what you marked`}
                  >
                    <Highlighter className="size-3.5 shrink-0 text-primary-ink" aria-hidden />
                    <span className="truncate font-medium">{s.label}</span>
                    {surfaceSelection?.onRemove && (
                      <button
                        type="button"
                        onClick={() => surfaceSelection?.onRemove?.(s.id)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        title="Unmark"
                        aria-label={`Unmark ${s.label}`}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    )}
                  </span>
                ))}
                {hiddenMarkCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMarks(true)}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                    aria-label={`Show all ${markItems.length} marked sections`}
                  >
                    +{hiddenMarkCount} more
                  </button>
                )}
                {showAllMarks && markItems.length > MARK_PILL_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllMarks(false)}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                    aria-label="Show fewer marked sections"
                  >
                    Show fewer
                  </button>
                )}
                {(surfaceSelection?.items.length ?? 0) > 1 && surfaceSelection?.onClear && (
                  <button
                    type="button"
                    onClick={() => surfaceSelection.onClear?.()}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    Clear {surfaceSelection.items.length} marked
                  </button>
                )}
              </div>
            )}
            {/* Follow-up suggestion chip (the suggester worker). One bounded
                row above the input, respecting the composer-height lesson from
                the marked-block pills. Enter (empty composer) or a click sends
                it verbatim; ArrowRight loads it for editing; X dismisses. */}
            {suggestion && !sending && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => void submit(e, suggestion)}
                  disabled={!agentReady}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 py-1 pl-2 pr-2.5 text-xs text-foreground transition-colors hover:bg-primary/20 disabled:opacity-40"
                  title="Send this follow-up (Enter while the composer is empty); press → to edit it first"
                >
                  <CornerDownLeft className="size-3.5 shrink-0 text-primary-ink" aria-hidden />
                  <span className="truncate font-medium">{suggestion}</span>
                </button>
                <button
                  type="button"
                  onClick={dismissSuggestion}
                  className="rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  title="Dismiss suggestion"
                  aria-label="Dismiss suggested follow-up"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.yaml,.yml"
                className="hidden"
                onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-col gap-1">
                {/* Attach picker — images + documents. Triggers the hidden
                    file input. Disabled when something's already attached
                    (clear it first via the preview's X). */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!agentReady || sending || !!attachedFile}
                  className="rounded-md border border-input bg-transparent p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
                  title="Attach image or document"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                {/* Marker — enter pick mode (minimises the chat) to attach
                    files, pages, notes… as context for the next turn. */}
                <button
                  type="button"
                  onClick={startPicking}
                  disabled={!agentReady || sending}
                  className="rounded-md border border-input bg-transparent p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
                  title="Pick content to attach (files, pages, notes…)"
                >
                  <SquareDashedMousePointer className="h-4 w-4" />
                </button>
                {/* Share-location toggle — sticky opt-in. When on, each send
                    attaches a fresh browser geolocation fix so the assistant
                    knows where you are (directions, "what's nearby"). */}
                <button
                  type="button"
                  onClick={() => void toggleShareLocation()}
                  disabled={!agentReady || sending}
                  aria-pressed={shareLocation}
                  className={
                    shareLocation
                      ? 'rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-40'
                      : 'rounded-md border border-input bg-transparent p-2 text-muted-foreground hover:bg-muted disabled:opacity-40'
                  }
                  title={
                    shareLocation
                      ? 'Sharing your location with the assistant — click to stop'
                      : 'Share your location with the assistant'
                  }
                >
                  <MapPin className="h-4 w-4" />
                </button>
                {/* Mic toggle — push-to-talk style. Recording state
                    shows a red destructive button; transcribing shows
                    a spinner. */}
                {recording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="rounded-md bg-destructive p-2 text-destructive-foreground hover:opacity-90"
                    title="Stop recording"
                  >
                    <MicOff className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={!agentReady || sending || transcribing}
                    className="rounded-md border border-input bg-transparent p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
                    title={transcribing ? 'Transcribing…' : 'Record voice note'}
                  >
                    {transcribing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  !agentReady
                    ? 'Configure an assistant or responder agent first at /settings/agents.'
                    : attachedFile
                      ? 'Add a question about the attachment (optional) — Enter to send.'
                      : recording
                        ? 'Recording… press the stop button to transcribe.'
                        : transcribing
                          ? 'Transcribing your recording…'
                          : replaceEligible
                            ? 'Typed too soon? Add a correction — Enter stops and resends both; Esc clears.'
                            : 'Message your assistant — Enter to send, Shift+Enter for newline.'
                }
                // In streaming mode the box stays live mid-turn so a correction
                // can be typed (the premature-Enter flow); blocking mode keeps
                // the old lock — it has no cancel primitive.
                disabled={!agentReady || (sending && !streamingOn)}
                rows={2}
                className={`${COMPOSER_BOX} flex-1 resize-none rounded-md border-input px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                onKeyDown={(e) => {
                  // Decision table lives in lib/composer-keys (pure + tested):
                  // the chip claims Enter/ArrowRight STRICTLY when the draft is
                  // empty, so Enter on anything the user typed (including a
                  // Stop-restored prompt) always sends their text.
                  const action = composerKeyAction(e, draft, suggestion);
                  if (action === 'send-suggestion' && suggestion) {
                    e.preventDefault();
                    void submit(e, suggestion);
                  } else if (action === 'edit-suggestion' && suggestion) {
                    // Load the suggestion for editing: chip → draft, cursor to
                    // the end (the textarea is already focused; the keystroke
                    // landed here).
                    e.preventDefault();
                    const s = suggestion;
                    dismissSuggestion();
                    setDraft(s);
                    requestAnimationFrame(() => {
                      const el = textareaRef.current;
                      if (el) el.setSelectionRange(el.value.length, el.value.length);
                    });
                  } else if (action === 'send-draft') {
                    e.preventDefault();
                    void submit(e);
                    return;
                  }
                  // Opt out of a pending correction: Esc clears the draft.
                  // stopPropagation keeps it from the panel's window-level
                  // Esc-to-minimize; scoped to the replace affordance only, so
                  // Esc behaves exactly as before everywhere else.
                  if (e.key === 'Escape' && showReplace) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraft('');
                  }
                }}
              />
              {sending ? (
                // Mid-turn the send slot holds a Stop button — and, when a
                // correction has been typed (streaming mode), a "stop and
                // resend" button beside it: one press supersedes the in-flight
                // turn and sends original + correction as one combined turn.
                <div className="flex shrink-0 gap-2 self-stretch">
                  {showReplace && (
                    <button
                      type="submit"
                      aria-label="Stop and resend with this correction"
                      title="Stop and resend with this correction (Enter) — Esc to discard it"
                      className="flex w-12 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <ListRestart className="size-4" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={stopTurn}
                    aria-label="Stop"
                    title="Stop generating"
                    disabled={!activeTurnId || stopping}
                    className="flex w-12 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
                  >
                    {stopping ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Square className="size-3.5 fill-current" aria-hidden />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  title="Send (Enter)"
                  disabled={!agentReady || (!draft.trim() && !attachedFile)}
                  className="flex w-12 shrink-0 items-center justify-center self-stretch rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  <CornerDownLeft className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {error && <p className="text-xs text-destructive-ink">{error}</p>}
            {notice && (
              <p className="text-xs text-muted-foreground">
                Too long to send in one turn — saved as the note{' '}
                <a className="underline underline-offset-2" href={`/notes/${notice.id}`}>
                  {notice.title}
                </a>{' '}
                and attached for {agentName ?? 'the assistant'} to read.
              </p>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
