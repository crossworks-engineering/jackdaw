import type { Components } from 'react-markdown';

/**
 * Markdown that draws no image. A screen that shows client-sourced markdown
 * (a request's body, a task's, the member chats) must not load an image from
 * anywhere the moment it opens: a tracking pixel would tell its author who
 * read it, when, and from where (client tier audit U5). So an image is its
 * words only (the alt text, else "image"), in brackets, and nothing is
 * fetched. Pass as ReactMarkdown's `components`.
 */
export const NO_IMAGES: Components = {
  img: ({ alt }) => <span className="text-muted-foreground">[{alt?.trim() || 'image'}]</span>,
};
