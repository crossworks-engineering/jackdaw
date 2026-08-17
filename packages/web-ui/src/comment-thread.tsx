'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SendHorizontal, Trash2 } from 'lucide-react';

import { Button } from './ui/button';
import { SubmitButton } from './ui/submit-button';
import { Textarea } from './ui/textarea';
import { Spinner } from './ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { cn } from './lib/utils';
import { formatDayTime } from './lib/format-datetime';
import type { NodeComment } from '@mantle/client-types';

/**
 * A discussion thread on a node — modeled on the Team Forum's post anatomy
 * (`mine` computed server-side, name snapshot + role chip, own posts tinted).
 *
 * PRESENTATION ONLY. The owner surface reads `/api/nodes/:id/comments` with a
 * session/bearer and repaints over SSE; the member surface reads
 * `/api/team/comments` with a team token and polls, because that stream is
 * owner-gated. Neither transport belongs in here — the caller fetches, this
 * renders, and the two surfaces stop drifting.
 *
 * They HAD drifted: the owner thread put the composer on top and ran
 * newest-first, the member thread did the opposite and centred itself
 * (`mx-auto max-w-2xl`, which §6c retired). This component is the owner
 * behaviour, which is the one the style guide calls the reference — on a long
 * thread the reply box is the control you always want, and at the foot it
 * drifts further away with every comment added.
 */
export function CommentThread({
  comments,
  pending = false,
  roleChip,
  onSend,
  onDelete,
  className,
}: {
  /** Oldest-first, as both APIs return them — this reverses for display. */
  comments: NodeComment[];
  /** The first load is still in flight; renders a spinner instead of the
   *  empty state, so "no comments yet" is never shown before we know. */
  pending?: boolean;
  /**
   * Chip text per author kind, `null` where the name speaks for itself. The
   * vocabulary is per-surface, not universal: an owner reading their own task
   * needs "Team" marked and their own login not, and a member needs the
   * reverse.
   */
  roleChip: Record<NodeComment['authorKind'], string | null>;
  /** Post a comment. Resolve `true` to clear the composer, `false` to keep the
   *  draft so a failed send is not silently lost. */
  onSend: (body: string) => Promise<boolean>;
  /** Omit where the surface cannot moderate — members read the whole thread
   *  but deletion stays owner-side, so the button must not merely be disabled;
   *  it must not be there. */
  onDelete?: (id: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (await onSend(body)) setDraft('');
    } finally {
      setSending(false);
    }
  };

  // Newest first. Both APIs order by `createdAt` ASC (packages/content
  // node-comments.ts), so a reverse is exact — including for two comments that
  // share a timestamp, which a re-sort would reorder arbitrarily.
  const newestFirst = [...comments].reverse();

  return (
    <section className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold">
        Comments
        {newestFirst.length > 0 && (
          <span className="ml-1.5 font-normal text-muted-foreground">({newestFirst.length})</span>
        )}
      </h3>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="space-y-2"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Write a comment… (markdown, ⌘↵ to send)"
        />
        <div className="flex justify-end">
          <SubmitButton pending={sending} disabled={!draft.trim()}>
            <SendHorizontal /> Add comment
          </SubmitButton>
        </div>
      </form>

      {pending ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : newestFirst.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No comments yet. Start the discussion above.
        </p>
      ) : (
        <ul className="space-y-2">
          {newestFirst.map((c) => (
            <li
              key={c.id}
              className={cn(
                'group rounded-md border p-3',
                c.mine ? 'border-primary/20 bg-primary/5' : 'border-border bg-card',
              )}
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium">{c.mine ? 'You' : c.authorName}</span>
                {roleChip[c.authorKind] && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {roleChip[c.authorKind]}
                  </span>
                )}
                <span className="text-muted-foreground">{formatDayTime(c.createdAt)}</span>
                {c.editedAt && <span className="text-muted-foreground">(edited)</span>}
                {onDelete && (
                  // §8's delete idiom, row-scoped: grey until hover, no text
                  // label, and revealed on hover so a thread of ten posts is
                  // not a column of ten bins.
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive-ink group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => setDeleteId(c.id)}
                    aria-label="Delete comment"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <div className="prose prose-sm dark:prose-invert prose-accent mt-1 max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body}</ReactMarkdown>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = deleteId;
                setDeleteId(null);
                if (id) onDelete?.(id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
