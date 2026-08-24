'use client';

import { useMemo, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { RecallMapDetailDTO, RecallNodeDTO } from '@mantle/client-types';
import { recallOptionsMarkdown } from '@mantle/content-core/recall-compile';
import { markdownToDoc } from '@mantle/content-core/markdown';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';

/**
 * The routing editor — the "make routing easy" half of the map workshop.
 * Replaces hand-writing the `## Options` markdown convention: pick a target
 * from the map, type the label and use-when line, and the dialog writes the
 * canonical markdown through `recallOptionsMarkdown` — the SAME writer the
 * agent authoring tools use, so both paths emit byte-identical options.
 *
 * Storage stays the page: the save reads the committed doc, replaces only the
 * trailing Options section, and commits through the normal page path — the
 * compiler, lint, and trust model are untouched.
 */

type OptionDraft = { label: string; useWhen: string; targetId: string };

type PageDoc = { type?: string; content?: unknown[] };
type PageForCommit = {
  id: string;
  doc: PageDoc;
  draft: Record<string, unknown> | null;
  draftRev?: number;
};

export function RoutingEditor({
  map,
  node,
  open,
  onOpenChange,
}: {
  map: RecallMapDetailDTO;
  node: RecallNodeDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const slugToId = useMemo(
    () => new Map(map.nodes.map((n) => [n.slug, n.id] as const)),
    [map.nodes],
  );
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    node.options.map((o) => ({
      label: o.label,
      useWhen: o.useWhen,
      targetId: slugToId.get(o.targetSlug) ?? '',
    })),
  );

  // In-map targets only, matching the lint; routing a node to itself is noise.
  const targets = map.nodes.filter((n) => n.id !== node.id);

  const rowIssues = options.map((o) => {
    if (!o.targetId) return 'pick a target node';
    if (!o.label.trim()) return 'label is required';
    if (!o.useWhen.trim()) return 'the "use when …" line is required';
    return null;
  });
  const indexNeedsOptions = node.kind === 'index' && options.length === 0;
  const valid = rowIssues.every((i) => i === null) && !indexNeedsOptions;

  function update(i: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  }
  function move(i: number, dir: -1 | 1) {
    setOptions((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function onSave() {
    startTransition(async () => {
      try {
        const { page } = await apiFetch<{ page: PageForCommit }>(`/api/pages/${node.id}`, {
          cache: 'no-store',
        });
        if (page.draft) {
          toast.error(
            'This page has uncommitted draft edits. Commit or discard them in the editor first, then edit the routing.',
          );
          return;
        }
        const doc = withOptionsSection(
          page.doc,
          options.map((o) => ({
            label: o.label,
            useWhen: o.useWhen,
            targetPageId: o.targetId,
          })),
        );
        await apiSend(`/api/pages/${node.id}/commit`, 'POST', {
          doc,
          ...(page.draftRev !== undefined ? { if_rev: page.draftRev } : {}),
        });
        // The commit recompiled the whole map server-side; refetch everything.
        await queryClient.invalidateQueries({ queryKey: ['recall'] });
        queryClient.invalidateQueries({ queryKey: ['pages', node.id] });
        toast.success(`Routing saved — “${node.title}” recompiled`);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save the routing');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!pending ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Routing — {node.title}</DialogTitle>
          <DialogDescription>
            The options an agent sees on this node: where each one leads and when to follow it.
            Saving rewrites the page&apos;s Options section and recompiles the map.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
          {options.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              No options — agents stop here.
              {indexNeedsOptions && (
                <span className="mt-1 block text-warning-ink">
                  The index must offer options, or the map fails its lint.
                </span>
              )}
            </p>
          )}
          {options.map((o, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`opt-target-${i}`}>Leads to</Label>
                  <Select value={o.targetId} onValueChange={(v) => update(i, { targetId: v })}>
                    <SelectTrigger id={`opt-target-${i}`}>
                      <SelectValue placeholder="Pick a node in this map" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`opt-label-${i}`}>Label</Label>
                  <Input
                    id={`opt-label-${i}`}
                    value={o.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="Fleet access"
                  />
                </div>
              </div>
              <div className="mt-2 space-y-1">
                <Label htmlFor={`opt-when-${i}`}>Use when</Label>
                <Input
                  id={`opt-when-${i}`}
                  value={o.useWhen}
                  onChange={(e) => update(i, { useWhen: e.target.value })}
                  placeholder="use when logging into a box"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-warning-ink">{rowIssues[i]}</span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, 1)}
                    disabled={i === options.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove option"
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setOptions((prev) => [...prev, { label: '', useWhen: 'use when ', targetId: '' }])
            }
            disabled={targets.length === 0}
          >
            <Plus /> Add option
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton pending={pending} disabled={!valid} onClick={onSave} type="button">
              Save routing
            </SubmitButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Heading test mirrored from recall-compile's parser: any level, text "options". */
function isOptionsHeading(node: unknown): boolean {
  const n = node as { type?: string; content?: unknown[] };
  return n?.type === 'heading' && inlineText(n).trim().toLowerCase() === 'options';
}

function inlineText(node: {
  type?: string;
  text?: string;
  attrs?: { label?: unknown };
  content?: unknown[];
}): string {
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'mention') return typeof node.attrs?.label === 'string' ? node.attrs.label : '';
  if (node.type === 'hardBreak') return ' ';
  return ((node.content ?? []) as Parameters<typeof inlineText>[0][]).map(inlineText).join('');
}

/**
 * Replace the trailing Options section: keep every body node BEFORE the LAST
 * "Options" heading exactly as committed (no markdown round-trip of the body —
 * rich content stays untouched), then append the canonical section emitted by
 * `recallOptionsMarkdown`. An empty options list removes the section.
 */
function withOptionsSection(
  doc: PageDoc,
  options: { label: string; useWhen: string; targetPageId: string }[],
): PageDoc {
  const content = Array.isArray(doc.content) ? doc.content : [];
  let headingAt = -1;
  for (let i = 0; i < content.length; i++) {
    if (isOptionsHeading(content[i])) headingAt = i;
  }
  const body = headingAt === -1 ? content : content.slice(0, headingAt);
  const md = recallOptionsMarkdown(options);
  const section = md ? ((markdownToDoc(md) as PageDoc).content ?? []) : [];
  return { type: 'doc', content: [...body, ...section] };
}
