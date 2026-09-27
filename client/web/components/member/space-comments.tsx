'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { useToast } from '@mantle/web-ui/ui/toast';
import { memberSpace } from '@/lib/member-space';
import { spaceErrorMessage } from './space-status';

/**
 * The discussion on a personal item (member logins Phase 2): on a teammate's
 * shared item, and on an own item while it is shared or submitted (the review
 * discussion). Oldest first; a member deletes only their own comments.
 */
export function SpaceComments({ source, id }: { source: 'mine' | 'team'; id: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  // Posting clears the composer and disables its button; deleting removes
  // the focused button: either way focus returns to the composer, not the
  // page body.
  const composer = useRef<HTMLTextAreaElement>(null);
  const toComposer = () => composer.current?.focus();
  const key = ['member-space-comments', source, id];
  const q = useQuery({ queryKey: key, queryFn: () => memberSpace.comments(source, id) });
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: () => memberSpace.addComment(source, id, text),
    onSuccess: () => {
      setText('');
      refresh();
      toComposer();
    },
    onError: (err) => toast.error(spaceErrorMessage(err, 'Could not post the comment.')),
  });
  const del = useMutation({
    mutationFn: (commentId: string) => memberSpace.deleteComment(source, id, commentId),
    onSuccess: () => {
      refresh();
      toComposer();
    },
    onError: (err) => toast.error(spaceErrorMessage(err, 'Could not delete the comment.')),
  });
  const comments = q.data?.comments ?? [];

  return (
    <section className="space-y-3 border-t border-border pt-4" aria-label="Comments">
      <h3 className="text-sm font-semibold">Comments</h3>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="group/comment rounded-md bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.authorName}</span>
                <span>{new Date(c.createdAt).toLocaleString()}</span>
                {c.mine ? (
                  <Button
                    variant="ghost"
                    size="icon-2xs"
                    // Hover-revealed only where the pointer can hover; on
                    // touch it stays visible, at reduced emphasis.
                    className="ml-auto opacity-60 group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
                    aria-label="Delete comment"
                    disabled={del.isPending}
                    onClick={() => del.mutate(c.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <Textarea
          ref={composer}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          rows={2}
          maxLength={10_000}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!text.trim() || add.isPending}>
            Comment
          </Button>
        </div>
      </form>
    </section>
  );
}
