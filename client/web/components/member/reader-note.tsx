'use client';

import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';

/**
 * A note, read only, with its pictures mapped for the reader (client tier
 * audit U4): the same column and prose as the share NotePresenter (embedded
 * chrome), but each markdown picture goes through `imagePath`, which names
 * the reader's own byte route or null. A null picture draws its alt text,
 * as a comment thread does, so no picture outside the reader's routes is
 * ever asked for.
 */
export function ReaderNote({
  content,
  imagePath,
}: {
  content: string;
  imagePath: (src: string) => string | null;
}) {
  const asset = useAssetUrl();
  const components: Components = {
    img: ({ src, alt }) =>
      typeof src === 'string' && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- token-authed client bytes; next/image cannot optimise them
        <img src={asset(src)} alt={alt ?? ''} />
      ) : (
        <span className="text-muted-foreground">[{alt?.trim() || 'image'}]</span>
      ),
  };
  return (
    <article className="max-w-3xl px-6 py-6">
      <div className="prose dark:prose-invert max-w-none prose-accent prose-document">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
          urlTransform={(url, key, node) =>
            node.tagName === 'img' && key === 'src'
              ? (imagePath(url) ?? '')
              : defaultUrlTransform(url)
          }
        >
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
