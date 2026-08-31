'use client';

/**
 * Pictures the agent produced, on the MEMBER surfaces (Team Chat + the Forum).
 *
 * Two ways one arrives, matching the owner assistant exactly:
 *   - the reply writes `![alt](media:<node-id>)` and the picture lands in the
 *     sentence it belongs to;
 *   - `show_image` returns an artifact, persisted onto the row's `attachments`
 *     and drawn as a strip BELOW the reply.
 * The server drops the first from the second so nothing renders twice
 * (assistant-runtime/inline-images.ts).
 *
 * ⚠ Fetched, not `<img src>`. The bytes come from the member media routes,
 * which authenticates a member by EITHER the `mantle_team_chat` cookie or a
 * bearer from localStorage. An `<img>` tag can only ever send the cookie, so a
 * plain tag works on a same-origin box and 401s on a split one — the exact
 * class of bug that makes the inline share reader same-origin-only. Going
 * through `teamFetch` and rendering an object URL works on both.
 */
import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { teamFetch } from '@mantle/web-ui/team-fetch';
import { cn } from '@mantle/web-ui/lib/utils';
import {
  drawingNodeId,
  mediaNodeId,
  teamDrawingPath,
  teamMediaPath,
  type MediaSurface,
} from '@/lib/team-media';

export type { MediaSurface };

/** Widest common shape of the two surfaces' rows. `kind` is optional because
 *  the forum's upload chips model it that way; an entry without one is not an
 *  image and is skipped. */
export type AgentAttachment = {
  kind?: string;
  nodeId?: string;
  mime?: string;
  caption?: string;
};

/**
 * One picture. Holds an object URL for its lifetime and revokes it on unmount —
 * a chat scrolls, and a leaked blob per image adds up over a long thread.
 *
 * A failure is drawn, not swallowed: the server answers a uniform 404 for
 * "gone", "not yours" and "not an image" alike, and a member who can see the
 * sentence referring to a picture should be told the picture did not load
 * rather than left looking at a gap.
 */
export function AgentImage({
  surface,
  nodeId,
  alt,
  className,
  kind = 'image',
}: {
  surface: MediaSurface;
  nodeId: string;
  alt?: string;
  className?: string;
  /** Which door the bytes come from. A drawing is a `draw` NODE, not a file,
   *  so it has its own route — the media one serves file bytes and refuses any
   *  mime that is not an image. Everything after the fetch is identical, which
   *  is why this is a prop and not a second component. */
  kind?: 'image' | 'drawing';
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const path =
          kind === 'drawing' ? teamDrawingPath(surface, nodeId) : teamMediaPath(surface, nodeId);
        const res = await teamFetch(path, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [surface, nodeId, kind]);

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
        <ImageOff className="size-3.5" aria-hidden />
        {alt?.trim()
          ? `Couldn’t load “${alt}”`
          : kind === 'drawing'
            ? 'Couldn’t load this drawing'
            : 'Couldn’t load this image'}
      </span>
    );
  }
  if (!src) {
    return (
      <span className="inline-flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Loading {kind === 'drawing' ? 'drawing' : 'image'}…
      </span>
    );
  }
  return (
    /* An object URL, not a remote asset: next/image cannot optimize a blob and
       would only proxy it. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || kind}
      className={cn(
        // Click behavior belongs to the surface's image lightbox now (both
        // team surfaces mount one) — a local window.open here would be a
        // second, competing viewer on the same click.
        'max-h-96 w-full rounded-lg border border-border object-contain',
        // A snapshot is exported light-mode WITH its own background, so it
        // reads as a framed drawing on either page theme rather than adapting
        // — and mangling — its own colours. The share DrawPresenter mats it the
        // same way, deliberately.
        kind === 'drawing' && 'bg-white',
        className,
      )}
    />
  );
}

/**
 * The strip below a reply — every artifact the reply did NOT place itself.
 * Non-image artifacts keep the chip treatment the member surfaces already use:
 * markdown has no way to place audio or a generated file inline, so there is no
 * inline copy for them to duplicate.
 */
export function AgentMediaStrip({
  surface,
  attachments,
}: {
  surface: MediaSurface;
  attachments: readonly AgentAttachment[];
}) {
  const images = attachments.filter((a) => a.kind === 'image' && a.nodeId);
  if (images.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {images.map((a) => (
        <figure key={a.nodeId} className="m-0">
          <AgentImage surface={surface} nodeId={a.nodeId!} alt={a.caption} />
          {a.caption && (
            <figcaption className="px-2 py-1 text-[11px] italic text-muted-foreground">
              {a.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

/**
 * `components` for the member surfaces' `<ReactMarkdown>`, so an inline
 * `![alt](media:<id>)` draws the picture instead of a broken tag.
 *
 * Deliberately NOT the owner's route. `/pages` and the owner assistant render
 * through TipTap + `lib/rich-markdown.ts`, which brings callouts, columns and
 * the whole page schema with it — the member dialect is standard Markdown on
 * purpose (see the note in team-chat-client.tsx). This is the one marker they
 * need, and nothing else.
 *
 * Two markers now: `media:<id>` for a picture the responder produced, and
 * `draw:<id>` for a drawing. They are separate because they resolve through
 * different routes, and a reply cannot be trusted to know which kind of node an
 * id belongs to — `media:` pointed at a drawing should read as a broken
 * picture, not quietly become one.
 *
 * A src matching neither falls through to a normal image, so an ordinary link
 * to a public picture still works.
 */
export function mediaMarkdownComponents(surface: MediaSurface) {
  return {
    img({ src, alt }: { src?: string | Blob; alt?: string }) {
      const raw = typeof src === 'string' ? src : '';
      const nodeId = mediaNodeId(raw);
      if (nodeId) return <AgentImage surface={surface} nodeId={nodeId} alt={alt} />;
      const drawId = drawingNodeId(raw);
      if (drawId) return <AgentImage surface={surface} nodeId={drawId} alt={alt} kind="drawing" />;
      return (
        /* An author-supplied remote URL in a reply; next/image would need every
           such host allowlisted. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={raw} alt={alt || ''} className="max-h-96 rounded-lg object-contain" />
      );
    },
  };
}
