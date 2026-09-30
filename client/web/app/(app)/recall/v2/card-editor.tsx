'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import type {
  RecallCardDetailDTO,
  RecallMapDetailDTO,
  RecallMapSummaryDTO,
  RecallNodeDTO,
  RecallWriteResultDTO,
} from '@mantle/web-ui/types/recall-v2';
import { RECALL_BODY_CHAR_BUDGET } from '@mantle/content-core/recall-compile';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Switch } from '@mantle/web-ui/ui/switch';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import { Field, FieldDescription, FieldError, FieldLabel } from '@mantle/web-ui/ui/field';
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
import { MarkdownEditor } from '@/components/markdown-editor';
import {
  RECALL_ENTRY_SLUG,
  budgetState,
  cardProblems,
  cardWriteBody,
  editsOf,
  optionTargets,
  recallKeys,
  sameEdits,
  type CardEdits,
} from '@/lib/recall-v2';
import { OptionsEditor } from './options-editor';
import type { useMapWrite } from './use-map-write';

/**
 * One card: title, use-when, the Prompt switch, the markdown body with its
 * character budget, and its options. Saving writes the WHOLE card (the brain
 * replaces it), built from what the brain last sent plus these edits.
 *
 * The body is fetched per card: the map's list shape carries only its size,
 * so a 100-card map does not ship every body to draw a sidebar.
 */
export function CardEditor({
  map,
  node,
  catalog,
  write,
  onDirtyChange,
  onDeleted,
}: {
  map: RecallMapDetailDTO;
  node: RecallNodeDTO;
  catalog: RecallMapSummaryDTO[];
  write: ReturnType<typeof useMapWrite>;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}) {
  const cardQuery = useQuery({
    queryKey: recallKeys.card(map.id, node.slug),
    queryFn: () =>
      apiFetch<{ card: RecallCardDetailDTO }>(`/api/recall/maps/${map.id}/cards/${node.slug}`).then(
        (r) => r.card,
      ),
  });

  if (cardQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (cardQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Could not load this card.</p>
        <Button variant="outline" size="sm" onClick={() => cardQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <Editor
      map={map}
      card={cardQuery.data}
      catalog={catalog}
      write={write}
      onDirtyChange={onDirtyChange}
      onDeleted={onDeleted}
    />
  );
}

function Editor({
  map,
  card,
  catalog,
  write,
  onDirtyChange,
  onDeleted,
}: {
  map: RecallMapDetailDTO;
  card: RecallCardDetailDTO;
  catalog: RecallMapSummaryDTO[];
  write: ReturnType<typeof useMapWrite>;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  // `baseline` is the card as the brain last sent it; `edits` is the form.
  const [baseline, setBaseline] = useState<CardEdits>(() => editsOf(card));
  const [edits, setEdits] = useState<CardEdits>(baseline);
  const [deleting, setDeleting] = useState(false);
  const dirty = !sameEdits(edits, baseline);

  // A fresh copy from the brain (after a save, a restore, or an agent's
  // edit) replaces the form, unless the owner was mid-edit against the OLD
  // copy: then their edits stay, and a save is checked against the new
  // version rather than silently discarding what they typed. After the
  // owner's own save the form already equals the new copy, so it is clean.
  const [seen, setSeen] = useState(card.updatedAt);
  if (card.updatedAt !== seen) {
    const fresh = editsOf(card);
    setSeen(card.updatedAt);
    setBaseline(fresh);
    if (!dirty) setEdits(fresh);
  }

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const entry = card.slug === RECALL_ENTRY_SLUG;
  const problems = cardProblems(edits, RECALL_BODY_CHAR_BUDGET);
  const valid = Object.keys(problems).length === 0;
  const chars = edits.bodyMd.length;
  const budget = budgetState(chars, RECALL_BODY_CHAR_BUDGET);
  const targets = useMemo(() => optionTargets(map, card.slug, catalog), [map, card.slug, catalog]);
  const warnings = write.warnings;

  function set<K extends keyof CardEdits>(key: K, value: CardEdits[K]) {
    setEdits((e) => ({ ...e, [key]: value }));
  }

  async function save() {
    await write.run(
      (version) =>
        apiSend<RecallWriteResultDTO>(
          `/api/recall/maps/${map.id}/cards/${card.slug}`,
          'PUT',
          cardWriteBody(edits, version),
        ),
      'Could not save the card.',
    );
  }

  async function answerPrompt(confirm: boolean) {
    const res = await write.run(
      (version) =>
        apiSend<RecallWriteResultDTO>(
          `/api/recall/maps/${map.id}/cards/${card.slug}/prompt`,
          'POST',
          { confirm, version },
        ),
      confirm ? 'Could not confirm the prompt.' : 'Could not drop the request.',
    );
    if (res) toast.success(confirm ? 'This card is a prompt now.' : 'Request dropped.');
  }

  async function deleteCard() {
    const res = await write.run(
      (version) =>
        apiSend<RecallWriteResultDTO>(
          `/api/recall/maps/${map.id}/cards/${card.slug}?version=${version}`,
          'DELETE',
        ),
      'Could not delete the card.',
    );
    setDeleting(false);
    if (!res) return;
    const dropped = res.optionsDropped ?? [];
    toast.success(
      dropped.length === 0
        ? 'Card deleted.'
        : `Card deleted. Removed the options to it on: ${dropped.map((d) => d.cardSlug).join(', ')}.`,
    );
    onDeleted();
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl space-y-5 p-4">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {card.slug}
            {entry && ' · entry card'}
          </p>
          {!entry && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete card"
              className="text-muted-foreground hover:text-destructive-ink"
              onClick={() => setDeleting(true)}
              disabled={write.pending}
            >
              <Trash2 />
            </Button>
          )}
        </div>

        {card.promptPending && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-sm">
            <Sparkles className="size-4 shrink-0 text-info-ink" aria-hidden />
            <span className="min-w-0 flex-1">
              An agent asked for this card to be a prompt. Until you confirm, it is never matched.
            </span>
            <div className="flex shrink-0 gap-2">
              <Button
                size="xs"
                variant="outline"
                onClick={() => answerPrompt(false)}
                disabled={write.pending || dirty}
              >
                Drop request
              </Button>
              <Button
                size="xs"
                onClick={() => answerPrompt(true)}
                disabled={write.pending || dirty}
                title={dirty ? 'Save or discard your edits first.' : undefined}
              >
                Make it a prompt
              </Button>
            </div>
          </div>
        )}

        <Field data-invalid={problems.title ? true : undefined}>
          <FieldLabel htmlFor="recall-card-title">Title</FieldLabel>
          <Input
            id="recall-card-title"
            value={edits.title}
            onChange={(e) => set('title', e.target.value)}
            aria-invalid={problems.title ? true : undefined}
          />
          {entry && (
            <FieldDescription>
              Renaming the map in its settings renames this card too; this field does not rename the
              map.
            </FieldDescription>
          )}
          <FieldError>{problems.title}</FieldError>
        </Field>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
          <div className="min-w-0">
            <FieldLabel htmlFor="recall-card-prompt">Prompt</FieldLabel>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A prompt is also found by meaning (recall_match), not only by walking the map.
            </p>
          </div>
          <Switch
            id="recall-card-prompt"
            checked={edits.prompt}
            onCheckedChange={(v) => set('prompt', v)}
          />
        </div>

        <Field data-invalid={problems.useWhen ? true : undefined}>
          <FieldLabel htmlFor="recall-card-use-when">Use when</FieldLabel>
          <Input
            id="recall-card-use-when"
            value={edits.useWhen}
            onChange={(e) => set('useWhen', e.target.value)}
            placeholder={edits.prompt ? 'deploying a release to the fleet' : 'Optional'}
            aria-invalid={problems.useWhen ? true : undefined}
          />
          <FieldDescription>
            {edits.prompt
              ? 'What a prompt is matched on. Required for a prompt.'
              : 'Only prompts use this line.'}
          </FieldDescription>
          <FieldError>{problems.useWhen}</FieldError>
        </Field>

        <Field data-invalid={problems.bodyMd ? true : undefined}>
          <FieldLabel>Body</FieldLabel>
          <MarkdownEditor
            value={edits.bodyMd}
            onChange={(v) => set('bodyMd', v)}
            placeholder="What an agent should know when it opens this card."
            height="h-[22rem]"
            defaultMode="edit"
          />
          <p
            className={cn(
              'text-xs tabular-nums',
              budget === 'ok' && 'text-muted-foreground',
              budget === 'near' && 'text-warning-ink',
              budget === 'over' && 'text-destructive-ink',
            )}
          >
            {chars.toLocaleString()} / {RECALL_BODY_CHAR_BUDGET.toLocaleString()} characters
          </p>
          <FieldError>{problems.bodyMd}</FieldError>
        </Field>

        <Field data-invalid={problems.options ? true : undefined}>
          <FieldLabel>Options</FieldLabel>
          <OptionsEditor
            options={edits.options}
            targets={targets}
            onChange={(o) => set('options', o)}
          />
          <FieldError>{problems.options}</FieldError>
        </Field>

        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
            {warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-ink" aria-hidden />
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button variant="outline" onClick={() => setEdits(baseline)} disabled={write.pending}>
              Discard changes
            </Button>
          )}
          <SubmitButton
            pending={write.pending}
            disabled={!dirty || !valid}
            onClick={save}
            type="button"
          >
            Save card
          </SubmitButton>
        </div>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {card.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Options on other cards that lead here are removed with it. You can restore the card
              from Revisions, but those options do not come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCard}>Delete card</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
