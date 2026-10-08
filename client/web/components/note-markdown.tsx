'use client';

import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { noteRefPath } from '@/lib/note-media';

/**
 * A note's markdown, read only, with its pictures and file links resolved
 * (lib/note-media.ts). Every reader of a note renders through this: the
 * owner's Notes screen, the member Library and spaces, the review queue and
 * the client portal; only `assetPath` differs between them.
 *
 * `assetPath` names the reader's own byte route for a picture or a
 * `media:` / `draw:` link, or null: a null picture draws its alt text and a
 * null link its text, so nothing outside the reader's routes is ever asked
 * for. An ordinary link keeps ReactMarkdown's own rule.
 */
export function NoteMarkdown({
  content,
  assetPath,
}: {
  content: string;
  assetPath: (src: string) => string | null;
}) {
  const asset = useAssetUrl();
  const components: Components = {
    img: ({ src, alt }) => {
      const path = typeof src === 'string' && src ? assetPath(src) : null;
      return path ? (
        // eslint-disable-next-line @next/next/no-img-element -- token-authed brain bytes; next/image cannot optimise them
        <img src={asset(path)} alt={alt ?? ''} />
      ) : (
        <span className="text-muted-foreground">[{alt?.trim() || 'image'}]</span>
      );
    },
    a: ({ href, children, node: _node, ...rest }) => {
      if (typeof href !== 'string' || !noteRefPath(href)) {
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      }
      const path = assetPath(href);
      return path ? (
        <a href={asset(path)} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        <span>{children}</span>
      );
    },
  };
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
      // A picture's src and a reference link reach the components above
      // untouched, so they resolve there; ReactMarkdown's default would turn
      // `media:` into an empty string first.
      urlTransform={(url, key, node) =>
        (node.tagName === 'img' && key === 'src') || noteRefPath(url)
          ? url
          : defaultUrlTransform(url)
      }
    >
      {content}
    </ReactMarkdown>
  );
}
