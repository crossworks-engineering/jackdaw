'use client';

import { useEffect, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import {
  inlineText,
  readUseWhen,
  withUseWhenParagraph,
  RECALL_PROMPT_TAG,
  RECALL_TAG,
  type PageDoc,
} from './recall-doc';

/**
 * Turn the page you are already writing into a Recall prompt.
 *
 * Before this, the only way to make a prompt was to know two tag names that
 * appear nowhere in the UI and to remember that the body must open with a
 * "Use when:" paragraph. This does both, in the right order: the doc commit
 * lands FIRST, then the tags. Tagging first would make the page a Recall
 * prompt for the instant before its use-when exists, and the compiler would
 * record a `prompt-no-use-when` failure the author never caused.
 *
 * `standalone` distinguishes the two real cases. A page already inside a map
 * only needs `prompt`, because its membership comes from the tree. A page outside
 * Recall needs `recall` too, which makes it a one-page map of its own; that is
 * exactly what docs/recall.md calls a standalone prompt.
 */

type PageForCommit = {
  id: string;
  title: string;
  tags: string[];
  doc: PageDoc;
  draft: Record<string, unknown> | null;
  draftRev?: number;
};

export function MakePromptDialog({
  pageId,
  standalone,
  open,
  onOpenChange,
}: {
  pageId: string;
  /** True when the page is not in any map yet, so it also needs `recall`. */
  standalone: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState<PageForCommit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useWhen, setUseWhen] = useState('');

  // Read the committed doc when the dialog opens: whether the page already
  // declares a use-when decides whether this is a one-field form or a
  // one-click confirmation.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPage(null);
    setLoadError(null);
    apiFetch<{ page: PageForCommit }>(`/api/pages/${pageId}`, { cache: 'no-store' })
      .then((r) => {
        if (cancelled) return;
        setPage(r.page);
        setUseWhen(readUseWhen(r.page.doc) ?? '');
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not read this page');
      });
    return () => {
      cancelled = true;
    };
  }, [open, pageId]);

  const existing = page ? readUseWhen(page.doc) : null;
  const hasDraft = Boolean(page?.draft);
  const valid = Boolean(page) && !hasDraft && useWhen.trim().length > 0;

  function onSave() {
    if (!page) return;
    startTransition(async () => {
      try {
        // Only rewrite the body when the line is missing or changed. An
        // untouched doc means no needless revision in the page's history.
        if (useWhen.trim() !== (existing ?? '')) {
          await apiSend(`/api/pages/${page.id}/commit`, 'POST', {
            doc: withUseWhenParagraph(stripExistingUseWhen(page.doc, existing), useWhen),
            ...(page.draftRev !== undefined ? { if_rev: page.draftRev } : {}),
          });
        }
        const tags = Array.from(
          new Set([...page.tags, ...(standalone ? [RECALL_TAG] : []), RECALL_PROMPT_TAG]),
        );
        await apiSend(`/api/pages/${page.id}`, 'PATCH', { tags });

        await queryClient.invalidateQueries({ queryKey: ['recall'] });
        void queryClient.invalidateQueries({ queryKey: ['pages'] });
        toast.success('This page is now a Recall prompt. Agents can match it by meaning.');
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not make this a prompt');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!pending ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Make this a Recall prompt</DialogTitle>
          <DialogDescription>
            Prompts are reusable procedures agents find by MEANING, through{' '}
            <span className="font-mono">recall_match</span>. Not by walking a map, and not by name.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive-ink">{loadError}</p>
        ) : !page ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-5" />
          </div>
        ) : hasDraft ? (
          <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
            This page has uncommitted draft edits. Commit or discard them first: making it a prompt
            rewrites the body, and that would discard your draft.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="make-prompt-use-when">Use when</Label>
              <Input
                id="make-prompt-use-when"
                value={useWhen}
                onChange={(e) => setUseWhen(e.target.value)}
                placeholder="about to start any server or dev process"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {existing
                  ? 'This page already declares a line; edit it or keep it as it is.'
                  : 'Added as the opening paragraph of the page. This exact line is what recall_match shows a caller, so write the situation, not the answer.'}
              </p>
            </div>
            <ul className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <li>
                Tags added:{' '}
                <span className="font-mono">{standalone ? 'recall, prompt' : 'prompt'}</span>
              </li>
              <li>
                {standalone
                  ? 'The page becomes a one-page map of its own.'
                  : 'The page stays in its current map and becomes matchable.'}
              </li>
              <li>Its text leaves general search. Recall serves it instead.</li>
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending} disabled={!valid} onClick={onSave} type="button">
            Make it a prompt
          </SubmitButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Drop the page's current use-when paragraph so re-running the dialog cannot
 *  stack two of them.
 *
 *  Only a LEADING paragraph that is itself a use-when declaration is removed.
 *  The compiler accepts the line anywhere in the first three blocks, so
 *  "the page has one" does not mean "block 0 is it", and dropping block 0 on that
 *  assumption would eat a real paragraph of the author's body. When the
 *  declaration sits deeper, the new one is simply prepended and the old line
 *  stays as ordinary text, which is wrong for nobody and destroys nothing. */
function stripExistingUseWhen(doc: PageDoc, existing: string | null): PageDoc {
  if (!existing) return doc;
  const content = Array.isArray(doc.content) ? doc.content : [];
  const first = content[0] as { type?: string } | undefined;
  if (first?.type !== 'paragraph') return doc;
  if (!isUseWhenParagraph(first)) return doc;
  return { type: 'doc', content: content.slice(1) };
}

/** Mirrors the compiler's `USE_WHEN_RE`: a "use when" prefix, then any run of
 *  colon, dash or space. */
function isUseWhenParagraph(node: unknown): boolean {
  return /^use when\b[:\s—–-]*\S/i.test(inlineText(node as Parameters<typeof inlineText>[0]));
}
