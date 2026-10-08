'use client';

import { NoteMarkdown } from '@/components/note-markdown';

/**
 * A note, read only, with its pictures mapped for the reader (client tier
 * audit U4): the same column and prose as the share NotePresenter (embedded
 * chrome), but each markdown picture and `media:` / `draw:` link goes
 * through `imagePath`, which names the reader's own byte route or null. A
 * null picture draws its alt text, as a comment thread does, so no picture
 * outside the reader's routes is ever asked for.
 */
export function ReaderNote({
  content,
  imagePath,
}: {
  content: string;
  imagePath: (src: string) => string | null;
}) {
  return (
    <article className="max-w-3xl px-6 py-6">
      <div className="prose dark:prose-invert max-w-none prose-accent prose-document">
        <NoteMarkdown content={content} assetPath={imagePath} />
      </div>
    </article>
  );
}
