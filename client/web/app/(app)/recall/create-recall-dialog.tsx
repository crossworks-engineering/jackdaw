'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import type { RecallMapDetailDTO } from '@mantle/client-types';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
import { Switch } from '@mantle/web-ui/ui/switch';
import { Textarea } from '@mantle/web-ui/ui/textarea';
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
import {
  buildRecallDoc,
  preflight,
  slugPreview,
  withAppendedOption,
  RECALL_BODY_CHAR_BUDGET,
  RECALL_PROMPT_TAG,
  RECALL_TAG,
  type PageDoc,
} from './recall-doc';

/**
 * The guided create: the other half of "make Recall authorable", next to the
 * routing editor.
 *
 * Recall pages are ordinary pages whose SHAPE satisfies the compiler, and
 * every part of that shape was previously tribal knowledge: two owner-only
 * tags nobody can discover, a leading "Use when:" paragraph, and an Options
 * block on the parent. Miss the last one and the map goes red the moment it
 * gains a second page (`index-no-options` fires only once a root has
 * children). That is the exact cliff this dialog removes: creating a node
 * WRITES its parent's option in the same action, so that state is never
 * reachable by following the UI.
 *
 * Nothing here is a new privilege. `POST /api/pages` is owner-session-auth and
 * has always accepted tags; the owner-only tag strip guards the AGENT tool
 * surface (packages/tools/src/builtins-pages.ts), which is what the trust
 * model actually rests on. This is the owner performing the owner's gesture
 * with a form instead of a memorised tag name. Do NOT "fix" it by stripping
 * here.
 */

export type CreateMode = 'map' | 'prompt' | 'node';

type PageForCommit = {
  id: string;
  doc: PageDoc;
  draft: Record<string, unknown> | null;
  draftRev?: number;
};

export function CreateRecallDialog({
  mode,
  map,
  defaultLinkFrom,
  open,
  onOpenChange,
}: {
  mode: CreateMode;
  /** Required for `node`; optional for `prompt` (absent = standalone). */
  map?: RecallMapDetailDTO | null;
  /** Which node the new option leaves from. Defaults to the map's index. */
  defaultLinkFrom?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const indexId = map?.nodes.find((n) => n.kind === 'index')?.id ?? map?.id ?? '';
  const [title, setTitle] = useState('');
  const [useWhen, setUseWhen] = useState('');
  const [body, setBody] = useState('');
  const [firstNode, setFirstNode] = useState('');
  const [isPrompt, setIsPrompt] = useState(mode === 'prompt');
  const [linkFrom, setLinkFrom] = useState(defaultLinkFrom ?? indexId);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUseWhen, setLinkUseWhen] = useState('');

  // A map's root and a prompt both declare a matcher line; a plain knowledge
  // node inside a map does not (its "when" lives on the option that reaches it).
  const declaresUseWhen = mode === 'map' || isPrompt;
  const inMap = mode === 'node' || (mode === 'prompt' && Boolean(map));
  const label = COPY[mode];

  const doc = useMemo(
    () => buildRecallDoc({ useWhen: declaresUseWhen ? useWhen : undefined, body }),
    [declaresUseWhen, useWhen, body],
  );
  // The REAL compiler lint, run in the browser. `parseRecallDoc` is pure, so
  // the author sees the same issues the server would raise, before saving.
  const pf = useMemo(() => preflight(doc, { isPrompt: declaresUseWhen }), [doc, declaresUseWhen]);

  const problems: string[] = [];
  if (!title.trim()) problems.push('A title is required.');
  if (declaresUseWhen && !useWhen.trim()) problems.push(`The “${label.useWhen}” line is required.`);
  if (inMap && !linkFrom) problems.push('Pick the node this one is reached from.');
  if (inMap && !linkUseWhen.trim()) problems.push('The link needs a “use when …” line.');
  for (const issue of pf.errors) problems.push(issue.message);
  const valid = problems.length === 0;

  function reset() {
    setTitle('');
    setUseWhen('');
    setBody('');
    setFirstNode('');
    setLinkLabel('');
    setLinkUseWhen('');
    setIsPrompt(mode === 'prompt');
    setLinkFrom(defaultLinkFrom ?? indexId);
  }

  /** Read a page, refuse if it has uncommitted draft edits, append the option,
   *  commit. Same guard and same commit path as the routing editor: a draft
   *  we overwrote would silently discard the author's own work. */
  async function linkFromParent(
    parentId: string,
    option: { label: string; useWhen: string; targetPageId: string },
  ) {
    const { page } = await apiFetch<{ page: PageForCommit }>(`/api/pages/${parentId}`, {
      cache: 'no-store',
    });
    if (page.draft) {
      throw new Error(
        'The parent page has uncommitted draft edits. Commit or discard them in the editor, then add the link from its Routing button.',
      );
    }
    await apiSend(`/api/pages/${parentId}/commit`, 'POST', {
      doc: withAppendedOption(page.doc, option),
      ...(page.draftRev !== undefined ? { if_rev: page.draftRev } : {}),
    });
  }

  function onSave() {
    startTransition(async () => {
      try {
        // Tags carry the whole meaning. A map root is `recall`; a standalone
        // prompt is `recall` + `prompt` (its own one-page map); anything
        // inside an existing tree inherits membership from parent_id and needs
        // only `prompt` when it is one.
        const tags =
          mode === 'map'
            ? [RECALL_TAG]
            : inMap
              ? isPrompt
                ? [RECALL_PROMPT_TAG]
                : []
              : [RECALL_TAG, RECALL_PROMPT_TAG];

        // Nest under the node that routes here, so the page tree and the
        // routing graph tell the same story. Membership is the recursive
        // parent_id subtree of the root, so any depth is in the map.
        const parentId = inMap ? linkFrom : undefined;

        const { page: created } = await apiSend<{ page: { id: string } }>('/api/pages', 'POST', {
          title: title.trim(),
          doc,
          tags,
          ...(parentId ? { parentId } : {}),
        });

        if (inMap) {
          await linkFromParent(linkFrom, {
            label: linkLabel.trim() || title.trim(),
            useWhen: linkUseWhen,
            targetPageId: created.id,
          });
        }

        // A brand-new map with a first node: create the child and wire the
        // index to it in one go. A root with children and no options is
        // exactly the `index-no-options` failure, so we never leave one.
        if (mode === 'map' && firstNode.trim()) {
          const { page: child } = await apiSend<{ page: { id: string } }>('/api/pages', 'POST', {
            title: firstNode.trim(),
            parentId: created.id,
          });
          await linkFromParent(created.id, {
            label: firstNode.trim(),
            useWhen: `you need ${firstNode.trim().toLowerCase()}`,
            targetPageId: child.id,
          });
        }

        await queryClient.invalidateQueries({ queryKey: ['recall'] });
        void queryClient.invalidateQueries({ queryKey: ['pages'] });
        toast.success(`${label.created}. Open it to write the content.`);
        reset();
        onOpenChange(false);
        router.push(`/pages/${created.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not create the ${mode}`);
      }
    });
  }

  const targets = map?.nodes ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => (!pending ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label.title}</DialogTitle>
          <DialogDescription>{label.description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          <div className="space-y-1">
            <Label htmlFor="recall-title">Title</Label>
            <Input
              id="recall-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={label.titlePlaceholder}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Agents address this node as <span className="font-mono">{slugPreview(title)}</span>.
              The compiler settles collisions, so the final slug can gain a number.
            </p>
          </div>

          {mode === 'node' && (
            <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
              <div className="min-w-0 pr-3">
                <Label htmlFor="recall-is-prompt">This node is a prompt</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Prompts are found by meaning through{' '}
                  <span className="font-mono">recall_match</span>, not only by walking the map. They
                  must declare a “Use when” line.
                </p>
              </div>
              <Switch id="recall-is-prompt" checked={isPrompt} onCheckedChange={setIsPrompt} />
            </div>
          )}

          {declaresUseWhen && (
            <div className="space-y-1">
              <Label htmlFor="recall-use-when">{label.useWhen}</Label>
              <Input
                id="recall-use-when"
                value={useWhen}
                onChange={(e) => setUseWhen(e.target.value)}
                placeholder={label.useWhenPlaceholder}
              />
              <p className="text-xs text-muted-foreground">{label.useWhenHint}</p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="recall-body">{label.body}</Label>
            <Textarea
              id="recall-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={label.bodyPlaceholder}
              rows={6}
              className="scrollbar-thin"
            />
            <p className="text-xs text-muted-foreground">
              Markdown. You can leave this empty and write it in the editor.{' '}
              <span className={pf.bodyChars > RECALL_BODY_CHAR_BUDGET ? 'text-warning-ink' : ''}>
                {pf.bodyChars.toLocaleString()} / {RECALL_BODY_CHAR_BUDGET.toLocaleString()}{' '}
                characters
              </span>
              .
            </p>
          </div>

          {inMap && (
            <div className="space-y-3 rounded-md border border-border bg-card p-3">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                How agents reach it
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="recall-link-from">Reached from</Label>
                  <Select value={linkFrom} onValueChange={setLinkFrom}>
                    <SelectTrigger id="recall-link-from">
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
                  <Label htmlFor="recall-link-label">Link label</Label>
                  <Input
                    id="recall-link-label"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder={title.trim() || 'Fleet access'}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="recall-link-when">Follow this link when</Label>
                <Input
                  id="recall-link-when"
                  value={linkUseWhen}
                  onChange={(e) => setLinkUseWhen(e.target.value)}
                  placeholder="logging into a box"
                />
                <p className="text-xs text-muted-foreground">
                  Written onto the parent&apos;s Options block for you, so the map cannot fail its
                  lint for a node nothing points at.
                </p>
              </div>
            </div>
          )}

          {mode === 'map' && (
            <div className="space-y-1">
              <Label htmlFor="recall-first-node">First node (optional)</Label>
              <Input
                id="recall-first-node"
                value={firstNode}
                onChange={(e) => setFirstNode(e.target.value)}
                placeholder="Architecture"
              />
              <p className="text-xs text-muted-foreground">
                Creates the page and wires the index to it. An index that has children but no
                options fails the lint, so starting with one keeps the map green.
              </p>
            </div>
          )}
        </div>

        <PreflightStrip problems={problems} warnings={pf.warnings.map((w) => w.message)} />

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending} disabled={!valid} onClick={onSave} type="button">
            {label.submit}
          </SubmitButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The live verdict. Errors here are the compiler's own words wherever they
 *  come from `parseRecallDoc`, so what the dialog blocks on and what the
 *  server would reject cannot drift apart. */
function PreflightStrip({ problems, warnings }: { problems: string[]; warnings: string[] }) {
  if (problems.length === 0 && warnings.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-success/50 bg-success/10 px-3 py-2 text-sm text-success-ink">
        <Check className="size-4 shrink-0" aria-hidden />
        Ready. This will compile cleanly.
      </p>
    );
  }
  return (
    <ul className="space-y-1 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
      {problems.map((p, i) => (
        <li key={`e${i}`} className="flex items-start gap-2 text-warning-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">{p}</span>
        </li>
      ))}
      {warnings.map((w, i) => (
        <li key={`w${i}`} className="flex items-start gap-2 text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">{w}</span>
        </li>
      ))}
    </ul>
  );
}

const COPY: Record<
  CreateMode,
  {
    title: string;
    description: string;
    titlePlaceholder: string;
    useWhen: string;
    useWhenPlaceholder: string;
    useWhenHint: string;
    body: string;
    bodyPlaceholder: string;
    submit: string;
    created: string;
  }
> = {
  map: {
    title: 'New Recall map',
    description:
      'A map is a page tree agents walk node by node. This creates its index page, tagged so the compiler serves it.',
    titlePlaceholder: 'Mantle registry',
    useWhen: 'Enter when',
    useWhenPlaceholder: 'working on Mantle and you need the durable reference',
    useWhenHint: 'The one line the catalog shows an agent deciding whether to enter this map.',
    body: 'Index content',
    bodyPlaceholder: 'What this map covers, and anything true of the whole domain.',
    submit: 'Create map',
    created: 'Map created',
  },
  prompt: {
    title: 'New Recall prompt',
    description:
      'A prompt is a reusable procedure agents find by MEANING, not by name. It is the automatic half of Recall.',
    titlePlaceholder: 'Safe start: check for a running instance',
    useWhen: 'Use when',
    useWhenPlaceholder: 'about to start any server or dev process',
    useWhenHint:
      'This exact line is what recall_match shows a caller. Write it as the situation, not the answer.',
    body: 'Prompt text',
    bodyPlaceholder: 'The procedure itself: what the agent should actually do.',
    submit: 'Create prompt',
    created: 'Prompt created',
  },
  node: {
    title: 'Add a node',
    description:
      'A knowledge node in this map, plus the option that leads an agent to it. Both are written together.',
    titlePlaceholder: 'Fleet, access & the MCP brains',
    useWhen: 'Use when',
    useWhenPlaceholder: 'you need a box, an ssh alias or a brain id',
    useWhenHint: 'Prompts must declare this; it is the line recall_match shows a caller.',
    body: 'Node content',
    bodyPlaceholder: 'The knowledge this node carries.',
    submit: 'Add node',
    created: 'Node added',
  },
};
