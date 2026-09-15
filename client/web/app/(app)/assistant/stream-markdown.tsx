'use client';

/**
 * The components ReactMarkdown uses for the LIVE streaming buffer — the
 * lightweight render that stands in until the durable reply lands and TipTap
 * takes over. Shared by the transcript and by `TurnRow`, and in its own module
 * so the row could move to its own file without importing the screen it is
 * rendered by.
 */
import { assetUrl } from '@mantle/web-ui/asset-url';
import { fileRawSrc, mediaFileId } from '@mantle/content-core/markdown-refs';

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
export const STREAM_MARKDOWN_COMPONENTS = {
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
