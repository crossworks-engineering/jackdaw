'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SendHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import { useRealtime } from '@/components/realtime/use-realtime';
import type { NodeComment } from '@mantle/client-types';

/** Role chip text per author kind — the forum's vocabulary. */
const ROLE_CHIP: Record<NodeComment['authorKind'], string | null> = {
  owner: null, // a login's name speaks for itself
  member: 'Team',
  agent: 'Assistant',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * The discussion thread on a task — modeled on the Team Forum's post anatomy
 * (`mine` computed server-side, name snapshot + role chip, own posts tinted).
 * Self-contained: owns its query, its composer, and a realtime subscription
 * scoped to this node so a member/agent comment appears live.
 */
export function TaskComments({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const commentsQuery = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () =>
      apiFetch<{ comments: NodeComment[] }>(`/api/nodes/${taskId}/comments`).then(
        (r) => r.comments,
      ),
  });

  useRealtime(['comment'], (c) => {
    if (c.id && c.id !== taskId) return;
    void queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
    // Counts ride on the task rows too.
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  });

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await apiSend(`/api/nodes/${taskId}/comments`, 'POST', { body });
      setDraft('');
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error ? e.message : 'Could not add comment');
      }
      return;
    } finally {
      setSending(false);
    }
    void queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const remove = async (id: string) => {
    try {
      await apiSend(`/api/comments/${id}`, 'DELETE');
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error ? e.message : 'Could not delete comment');
      }
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const comments = commentsQuery.data ?? [];

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">
        Comments
        {comments.length > 0 && (
          <span className="ml-1.5 font-normal text-muted-foreground">({comments.length})</span>
        )}
      </h3>

      {commentsQuery.isPending ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No comments yet. Start the discussion below.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                'group rounded-md border p-3',
                c.mine ? 'border-primary/20 bg-primary/5' : 'border-border bg-card',
              )}
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium">{c.mine ? 'You' : c.authorName}</span>
                {ROLE_CHIP[c.authorKind] && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {ROLE_CHIP[c.authorKind]}
                  </span>
                )}
                <span className="text-muted-foreground">{formatTime(c.createdAt)}</span>
                {c.editedAt && <span className="text-muted-foreground">(edited)</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-1.5 text-destructive-ink opacity-0 transition-opacity hover:text-destructive-ink group-hover:opacity-100"
                  onClick={() => setDeleteId(c.id)}
                  aria-label="Delete comment"
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="prose prose-sm dark:prose-invert prose-accent mt-1 max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body}</ReactMarkdown>
              </div>
            </li>
          ))}
        </ul>
      )}

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
                if (id) void remove(id);
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
