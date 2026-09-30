'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import type {
  RecallCardDetailDTO,
  RecallMapDetailDTO,
  RecallMapSummaryDTO,
  RecallNodeDTO,
  RecallWriteResultDTO,
} from '@mantle/web-ui/types/recall-v2';
import { RECALL_BODY_CHAR_BUDGET } from '@mantle/content-core/recall-compile';
import { apiSend } from '@mantle/web-ui/api-fetch';
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
  RECALL_LINE_MAX,
  RECALL_TITLE_MAX,
  budgetState,
  cardProblems,
  cardWriteBody,
  droppedText,
  editsOf,
  isStale,
  normalisedEdits,
  optionTargets,
  recallKeys,
  sameEdits,
  versionState,
  writeErrorText,
  type CardEdits,
} from '@/lib/recall-v2';
import { OptionsEditor } from './options-editor';
import { cardQuery, mapQuery, type MapWrite } from './use-map-write';

/**
 * One card: title, use-when, the Prompt switch, the markdown body with its
 * character budget, and its options.
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
  write: MapWrite;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}) {
  const q = useQuery(cardQuery(map.id, node.slug));

  if (q.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Could not load this card.</p>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <Editor
      map={map}
      card={q.data}
      catalog={catalog}
      write={write}
      onDirtyChange={onDirtyChange}
      onDeleted={onDeleted}
    />
  );
}

/** Why the last save did not happen, when it was refused as stale. `gone`:
 *  the card could not even be reloaded (deleted under the edit). */
type Refused = 'card' | 'map' | 'gone' | null;

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
  write: MapWrite;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const fresh = useMemo(() => editsOf(card), [card]);
  // `base` is the copy the edit started from, and the map version it was
  // read at: a save sends THAT version, so a change made under the edit is
  // refused by the brain instead of being overwritten. `edits` is the form.
  const [base, setBase] = useState<{ edits: CardEdits; version: number }>(() => ({
    edits: fresh,
    version: map.version,
  }));
  const [edits, setEdits] = useState<CardEdits>(fresh);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<Refused>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dirty = !sameEdits(edits, base.edits);

  // Has the brain's copy moved away from the base? The card's own content,
  // or the map version by a write that was not this tab's own.
  const cardChanged = !sameEdits(fresh, base.edits);
  const mapState = versionState(base.version, map.version, write.chain);
  if (!saving) {
    if (!dirty) {
      // A clean form follows the brain freely: after a save, a restore, or
      // an agent's edit, it simply shows the new copy.
      if (cardChanged || mapState === 'own' || mapState === 'foreign') {
        setBase({ edits: fresh, version: map.version });
        setEdits(fresh);
        if (refused) setRefused(null);
      }
    } else if (!cardChanged && mapState === 'own') {
      // Only the owner's own writes since (publish, reorder, settings): the
      // edit is still against the card as it is, so it moves up with them.
      setBase({ edits: base.edits, version: map.version });
    }
  }
  // A dirty form is never re-based silently. It says what happened instead.
  const conflict: 'card' | 'map' | null =
    !dirty || saving ? null : cardChanged ? 'card' : mapState === 'foreign' ? 'map' : null;
  const conflictKey = `${map.version}:${card.updatedAt}`;

  // A save in flight is not "unsaved": leaving then must not ask to discard.
  const unsaved = dirty && !saving;
  useEffect(() => {
    onDirtyChange(unsaved);
  }, [unsaved, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const entry = card.slug === RECALL_ENTRY_SLUG;
  const problems = cardProblems(edits, RECALL_BODY_CHAR_BUDGET);
  const valid = Object.keys(problems).length === 0;
  const chars = edits.bodyMd.length;
  const budget = budgetState(chars, RECALL_BODY_CHAR_BUDGET);
  const targets = useMemo(() => optionTargets(map, card.slug, catalog), [map, card.slug, catalog]);

  function set<K extends keyof CardEdits>(key: K, value: CardEdits[K]) {
    setEdits((e) => ({ ...e, [key]: value }));
  }

  /** Throw the edits away and show the brain's copy as it is now. */
  function showNewCopy() {
    setBase({ edits: fresh, version: map.version });
    setEdits(fresh);
    setRefused(null);
  }

  /** After a stale refusal: reload the card and the map, keep the owner's
   *  text, and make the reloaded copy the base, so the next save is an
   *  informed one. */
  async function reloadAfterRefusal() {
    try {
      const [m, c] = await Promise.all([
        qc.fetchQuery({ ...mapQuery(map.id), staleTime: 0 }),
        qc.fetchQuery({ ...cardQuery(map.id, card.slug), staleTime: 0 }),
      ]);
      const reloaded = editsOf(c);
      setRefused(sameEdits(reloaded, base.edits) ? 'map' : 'card');
      setBase({ edits: reloaded, version: m.version });
    } catch {
      setRefused('gone');
    }
  }

  async function save() {
    const sent = normalisedEdits(edits);
    let stale = false;
    setSaving(true);
    try {
      const res = await write.run(
        (version) =>
          apiSend<RecallWriteResultDTO>(
            `/api/recall/maps/${map.id}/cards/${card.slug}`,
            'PUT',
            cardWriteBody(sent, base.edits, version),
          ),
        'Could not save the card.',
        {
          version: base.version,
          onError: (err) => {
            if (isStale(err)) stale = true;
            else toast.error(writeErrorText(err, 'Could not save the card.'));
          },
        },
      );
      if (res) {
        // Show the saved copy now rather than wait for the refetch: until it
        // lands, the cached card is the old one, and a clean form would
        // otherwise follow it back for a moment.
        const promptMoved = sent.prompt !== base.edits.prompt;
        qc.setQueryData<RecallCardDetailDTO>(recallKeys.card(map.id, card.slug), (c) =>
          c
            ? {
                ...c,
                title: sent.title,
                bodyMd: sent.bodyMd,
                useWhen: sent.useWhen,
                options: sent.options,
                ...(promptMoved
                  ? { kind: sent.prompt ? 'prompt' : 'knowledge', promptPending: false }
                  : {}),
              }
            : c,
        );
        setBase({ edits: sent, version: res.version });
        // Typed more while it saved: keep that, it is a new edit.
        setEdits((cur) => (sameEdits(cur, sent) ? sent : cur));
        setRefused(null);
      } else if (stale) {
        toast.error('Not saved: this card or its map changed since you started editing.');
        await reloadAfterRefusal();
      }
    } finally {
      setSaving(false);
    }
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
    const dropped = droppedText(res.optionsDropped ?? []);
    toast.success(dropped ? `Card deleted. ${dropped}` : 'Card deleted.');
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

        {refused ? (
          <div
            role="alert"
            className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
          >
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-ink" aria-hidden />
              <span>
                {refused === 'card' &&
                  'Your save did not happen: this card changed since you started editing. The new copy is loaded under your edits. Save again to replace it with yours, or show the new copy and lose your edits.'}
                {refused === 'map' &&
                  'Your save did not happen: the map changed since you started editing (another card or its settings). This card is as you last saw it, and your edits are still here. Save again to write them.'}
                {refused === 'gone' &&
                  'Your save did not happen, and this card could not be reloaded. It may have been deleted. Copy your text somewhere safe before you leave it.'}
              </span>
            </p>
            {refused === 'card' && (
              <div className="flex justify-end">
                <Button size="xs" variant="outline" onClick={showNewCopy}>
                  Show the new copy
                </Button>
              </div>
            )}
          </div>
        ) : (
          conflict &&
          dismissed !== conflictKey && (
            <div
              role="status"
              className="space-y-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm"
            >
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
                <span>
                  {conflict === 'card'
                    ? 'This card changed since you started editing, maybe by an agent.'
                    : 'This map changed since you started editing (another card or its settings, maybe by an agent).'}{' '}
                  A save now is refused rather than overwrite it; the next save after that writes
                  your version.
                </span>
              </p>
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="outline" onClick={() => setDismissed(conflictKey)}>
                  Keep editing
                </Button>
                <Button size="xs" variant="outline" onClick={showNewCopy}>
                  Show the new copy (discard mine)
                </Button>
              </div>
            </div>
          )
        )}

        {card.promptPending && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-info/40 bg-info/5 px-3 py-2 text-sm">
            <Sparkles className="size-4 shrink-0 text-info-ink" aria-hidden />
            <span className="min-w-0 flex-1">
              An agent asked for this card to be a prompt, or changed the text of a prompt you had
              confirmed. Until you confirm it again, it is never matched.
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
            maxLength={RECALL_TITLE_MAX}
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

        {/* Not on the entry card: it is where every walk of the map starts, and
            the brain refuses to make it a prompt. */}
        {!entry && (
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
        )}

        <Field data-invalid={problems.useWhen ? true : undefined}>
          <FieldLabel htmlFor="recall-card-use-when">Use when</FieldLabel>
          <Input
            id="recall-card-use-when"
            value={edits.useWhen}
            onChange={(e) => set('useWhen', e.target.value)}
            maxLength={RECALL_LINE_MAX}
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
          <FieldLabel htmlFor="recall-card-body">Body</FieldLabel>
          <MarkdownEditor
            id="recall-card-body"
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
          <FieldLabel asChild>
            <span>Options</span>
          </FieldLabel>
          <OptionsEditor
            options={edits.options}
            targets={targets}
            onChange={(o) => set('options', o)}
          />
          <FieldError>{problems.options}</FieldError>
        </Field>

        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button variant="outline" onClick={() => setEdits(base.edits)} disabled={saving}>
              Discard changes
            </Button>
          )}
          <SubmitButton
            pending={saving}
            disabled={!dirty || !valid || (write.pending && !saving)}
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
              Options on other cards that lead here are removed with it. Restoring the card from
              Revisions brings it back with those options, under its old link name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteCard}
            >
              Delete card
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
