'use client';

/**
 * The small pieces a turn renders: the prompt card, an artifact, the channel badge and a stored attachment.
 *
 * Moved out of assistant-client.tsx unchanged (structure pass, phase 1):
 * already standalone, just living in the wrong file. No signatures changed.
 */
import { FileText, Image as ImageIcon, MapPin, Mic, Send } from 'lucide-react';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { assetUrl } from '@mantle/web-ui/asset-url';
import type { Artifact, Message, StoredAttachment } from './assistant-turns';
import { splitSentContext } from './assistant-turns';

/**
 * The user's prompt, rendered as a margin note beside the response it
 * produced. Quiet by design — muted card, small type — so Saskia's
 * document is the visual centre of gravity.
 */
export function PromptCard({ message }: { message: Message }) {
  const { typed, appended } = splitSentContext(message.text);
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm @3xl/thread:sticky @3xl/thread:top-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            You
          </span>
          <ChannelBadge channel={message.channel} />
          {message.superseded && (
            <span
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title="You stopped this turn and re-sent it with a correction — the combined message below replaced it."
            >
              replaced
            </span>
          )}
        </span>
        <span
          className="text-[10px] text-muted-foreground"
          title={formatDateTime(message.createdAt)}
        >
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
      {typed && <p className="whitespace-pre-wrap break-words text-foreground">{typed}</p>}
      {appended && (
        <p
          className="mt-1.5 inline-flex cursor-help items-center gap-1 text-[10px] text-muted-foreground"
          title={appended}
        >
          <MapPin className="size-3" aria-hidden />
          Sent with on-screen context
        </p>
      )}
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {message.attachments.map((a, i) => (
            <StoredAttachmentView key={`${message.id}-att-${i}`} attachment={a} />
          ))}
        </div>
      )}
      {message.artifacts && message.artifacts.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {message.artifacts.map((a, i) => (
            <ArtifactView key={`${message.id}-art-${i}`} artifact={a} />
          ))}
        </div>
      )}
      {message.pending && (
        <div className="mt-1 text-[10px] italic text-muted-foreground">sending…</div>
      )}
    </div>
  );
}

/**
 * Render one tool-emitted artifact inline. Audio gets an <audio
 * controls> element; images get a bounded preview with a click-to-
 * enlarge affordance. Both use a `data:` URL — no separate fetch.
 */
export function ArtifactView({ artifact }: { artifact: Artifact }) {
  // localPreviewUrl wins when set — it's an object URL pointing at
  // the in-memory blob and renders instantly. Falls through to the
  // base64 data URL once the server returns the real bytes.
  const dataUrl = artifact.localPreviewUrl ?? `data:${artifact.mimeType};base64,${artifact.base64}`;
  if (artifact.kind === 'audio') {
    return (
      <div className="rounded-lg border border-border bg-background/60 p-2">
        {/* controls renders the play button + scrubber + duration in
            the browser's native styling. Sufficient for our use case;
            a custom waveform UI would be nice-to-have but adds weight. */}
        <audio controls src={dataUrl} className="w-full" preload="metadata">
          Your browser doesn&apos;t support the audio element.
        </audio>
        {artifact.caption && (
          <p className="mt-1 text-[11px] italic text-muted-foreground">🔊 {artifact.caption}</p>
        )}
      </div>
    );
  }
  // image
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background/60">
      {/* Click behavior belongs to the thread's image lightbox (zoom + open
          original, data:-URL safe) — the old window.open+document.write
          fallback would be a second, competing viewer on the same click. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={artifact.caption ?? 'Generated image'}
        className="max-h-96 w-full object-contain"
      />
      {artifact.caption && (
        <p className="px-2 py-1 text-[11px] italic text-muted-foreground">🎨 {artifact.caption}</p>
      )}
    </div>
  );
}

/** Small chip marking which channel a turn came in on. Nothing for native web
 *  turns; a labeled glyph for Telegram / WhatsApp / future surfaces, so the
 *  unified stream makes its cross-channel origin obvious at a glance. */
export function ChannelBadge({ channel }: { channel?: string }) {
  if (!channel || channel === 'web') return null;
  const label = channel === 'telegram' ? 'Telegram' : channel === 'whatsapp' ? 'WhatsApp' : channel;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Send className="size-2.5" aria-hidden />
      {label}
    </span>
  );
}

/** Render a persisted attachment (DB-backed, no inline bytes). Images with a
 *  file nodeId render inline via the file-bytes route; everything else (voice
 *  notes, docs, backfilled images without a node, video) is a labeled chip —
 *  its actual content (e.g. a voice transcript) already lives in the turn text. */
export function StoredAttachmentView({ attachment }: { attachment: StoredAttachment }) {
  if (attachment.kind === 'image' && attachment.nodeId) {
    const src = assetUrl(`/api/files/files/${attachment.nodeId}?raw=1`);
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-background/60">
        {/* Click behavior belongs to the thread's image lightbox now. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={attachment.caption ?? 'image'}
          className="max-h-96 w-full object-contain"
        />
        {attachment.caption && (
          <p className="px-2 py-1 text-[11px] italic text-muted-foreground">{attachment.caption}</p>
        )}
      </div>
    );
  }
  const Icon =
    attachment.kind === 'voice' || attachment.kind === 'audio'
      ? Mic
      : attachment.kind === 'image'
        ? ImageIcon
        : FileText;
  const label =
    attachment.caption ??
    (attachment.kind === 'voice'
      ? 'Voice note'
      : attachment.kind.charAt(0).toUpperCase() + attachment.kind.slice(1));
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
