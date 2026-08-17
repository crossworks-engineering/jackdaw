'use client';

/**
 * Member-side comment thread on a shared task — the /team twin of the owner's
 * TaskComments. Talks to /api/team/comments (team token auth; the server gates
 * on the node being actively shared). Members can read the whole thread and
 * add their own comments; moderation (delete) stays owner-side.
 *
 * No SSE on the member surface (that stream is owner-gated), so the thread
 * polls at a slow interval — the documented best-effort remedy.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SendHorizontal } from 'lucide-react';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { teamFetch } from '@mantle/web-ui/team-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import type { NodeComment } from '@mantle/client-types';

const ROLE_CHIP: Record<NodeComment['authorKind'], string | null> = {
  owner: 'Owner',
  member: null, // members mostly read each other — the name is enough
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

export function TeamTaskComments({ nodeId }: { nodeId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const commentsQuery = useQuery({
    queryKey: ['team-task-comments', nodeId],
    queryFn: async () => {
      const r = await teamFetch(`/api/team/comments?nodeId=${encodeURIComponent(nodeId)}`);
      if (!r.ok) throw new Error(`comments failed (${r.status})`);
      const d = (await r.json()) as { comments: NodeComment[] };
      return d.comments;
    },
    refetchInterval: 30_000,
  });

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await teamFetch('/api/team/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, body }),
      });
      if (!r.ok) throw new Error(`send failed (${r.status})`);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['team-task-comments', nodeId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add comment');
    } finally {
      setSending(false);
    }
  };

  const comments = commentsQuery.data ?? [];

  return (
    <section className="mx-auto max-w-2xl space-y-3 px-6 pb-12">
      <h3 className="text-sm font-semibold">
        Comments
        {comments.length > 0 && (
          <span className="ml-1.5 font-normal text-muted-foreground">({comments.length})</span>
        )}
      </h3>

      {comments.length === 0 && !commentsQuery.isPending ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No comments yet. Start the discussion below.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                'rounded-md border p-3',
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
    </section>
  );
}
