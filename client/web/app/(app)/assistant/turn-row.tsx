'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { CopyButton } from '@mantle/web-ui/copy-button';
import { AiThinkingOrb } from '@/components/ai-thinking-orb';
import { ThoughtTrail } from '@/components/assistant/thought-trail';
import { RichText } from '@/components/assistant/rich-text';
import { useTurnStream } from '@/components/assistant/use-turn-stream';
import {
  ArtifactView,
  ChannelBadge,
  PromptCard,
  StoredAttachmentView,
} from './assistant-turn-parts';
import type { Turn } from './assistant-turns';
import { STREAM_MARKDOWN_COMPONENTS } from './stream-markdown';

type TurnStream = ReturnType<typeof useTurnStream>;
export type LiveTurn = {
  streamTrail: TurnStream['trail'];
  streamReply: TurnStream['reply'];
  streamPhase: TurnStream['phase'];
  stageLabel: string | null;
  streamStartedAt: TurnStream['startedAt'];
  streamTokens: TurnStream['tokens'];
  streamTokensApprox: TurnStream['tokensApprox'];
  streamReasoning: TurnStream['reasoning'];
  trailMode: React.ComponentProps<typeof ThoughtTrail>['mode'];
};

/**
 * One turn, memoised.
 *
 * The transcript has been memoised as a whole since v0.6.50, which keeps a
 * composer keystroke from walking it. But its deps include the streaming
 * buffer, which changes once per FRAME while a reply arrives — so every row
 * rebuilt on every frame, and a 25-turn thread rebuilt 25 rows to show one
 * of them growing.
 *
 * Every streaming value is read in the `showTyping` branch and nowhere else,
 * and that branch requires `!turn.response` — so a SETTLED turn reads none of
 * them. They travel together in `live`, which is `null` for every row but the
 * one in flight; that plus `turns` being memoised on `messages` (so settled
 * turn objects keep their identity across streaming frames) is what lets
 * `memo` bail out here.
 */
export const TurnRow = memo(function TurnRow({
  turn,
  idx,
  accentBorder,
  agentName,
  showTyping,
  live,
}: {
  turn: Turn;
  idx: number;
  accentBorder: string;
  agentName: string | null | undefined;
  showTyping: boolean;
  /** Non-null ONLY for the turn currently streaming. */
  live: LiveTurn | null;
}) {
  // A superseded pair (cancelled + re-sent with a correction) stays visible but
  // dimmed, tagged "replaced" on the prompt card — a truthful record the model
  // no longer sees.
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
              borderTopColor: `color-mix(in oklab, ${accentBorder} 20%, transparent)`,
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
                    {turn.response.toolStats.failed} of {turn.response.toolStats.calls} tool call
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
          live!.streamTrail.length > 0 || live!.streamReply ? (
            // aria-busy marks the subtree as still arriving, so a
            // screen reader treats a half-written reply as in flux
            // rather than as the finished answer. The sr-only line
            // stays for anyone who navigates INTO the turn; what gets
            // announced without navigating is TurnAnnouncer's job.
            <div className="max-w-xl" aria-busy={live!.streamPhase === 'streaming'}>
              <span className="sr-only">
                {agentName ?? 'Assistant'} is {live!.stageLabel ?? 'typing'}
              </span>
              {live!.streamTrail.length > 0 && (
                <ThoughtTrail
                  steps={live!.streamTrail}
                  live
                  mode={live!.trailMode}
                  startedAt={live!.streamStartedAt}
                  tokens={live!.streamTokens}
                  tokensApprox={live!.streamTokensApprox}
                  reasoning={live!.streamReasoning}
                />
              )}
              {live!.streamReply && (
                // Live buffer: a lightweight ReactMarkdown render, NOT the
                // TipTap RichText editor — the editor's setContent() runs
                // flushSync and collides with React mid-render when the buffer
                // changes every token. The durable reply below swaps in RichText.
                <div
                  className={`prose dark:prose-invert max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0 ${
                    live!.streamTrail.length > 0 ? 'mt-3' : ''
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={STREAM_MARKDOWN_COMPONENTS}
                  >
                    {live!.streamReply}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 py-2">
              <span className="sr-only">
                {agentName ?? 'Assistant'} is {live!.stageLabel ?? 'typing'}
              </span>
              <AiThinkingOrb label={live!.stageLabel} className="shrink-0" />
              {live!.stageLabel && (
                <span className="text-xs text-muted-foreground" aria-hidden>
                  {live!.stageLabel}
                </span>
              )}
            </div>
          )
        ) : null}
      </div>
    </li>
  );
});
