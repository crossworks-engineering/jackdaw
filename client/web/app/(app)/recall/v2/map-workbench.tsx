'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import type {
  RecallCardDetailDTO,
  RecallMapDetailDTO,
  RecallMapSummaryDTO,
  RecallNodeDTO,
  RecallWriteResultDTO,
} from '@mantle/web-ui/types/recall-v2';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@mantle/web-ui/ui/tabs';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
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
import { StatePill } from '@/components/item-list/state-pill';
import { useListNav } from '@/lib/use-list-nav';
import {
  RECALL_ENTRY_SLUG,
  editsOf,
  cardWriteBody,
  moveCard,
  recallKeys,
  withOption,
  writeErrorText,
} from '@/lib/recall-v2';
import { RecallGraph } from '../recall-graph';
import { CardEditor } from './card-editor';
import { AddCardDialog, MapSettingsDialog } from './map-dialogs';
import { RevisionsPanel } from './revisions-panel';
import { useMapWrite } from './use-map-write';
import type { RecallV2View } from './recall-v2-client';

/**
 * One native map: its header (publish, settings, delete) and three views of
 * it. Cards is the editor; Graph draws the same rows; Revisions is the log
 * of every write, agents' included, with restore.
 */
export function MapWorkbench({
  mapId,
  catalog,
  view,
  cardSlug,
}: {
  mapId: string;
  catalog: RecallMapSummaryDTO[];
  view: RecallV2View;
  cardSlug: string | null;
}) {
  const mapQuery = useQuery({
    queryKey: recallKeys.map(mapId),
    queryFn: () =>
      apiFetch<{ map: RecallMapDetailDTO }>(`/api/recall/maps/${mapId}`).then((r) => r.map),
  });

  if (mapQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (mapQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Could not load this map.</p>
        <Button variant="outline" size="sm" onClick={() => mapQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return <Workbench map={mapQuery.data} catalog={catalog} view={view} cardSlug={cardSlug} />;
}

function Workbench({
  map,
  catalog,
  view,
  cardSlug,
}: {
  map: RecallMapDetailDTO;
  catalog: RecallMapSummaryDTO[];
  view: RecallV2View;
  cardSlug: string | null;
}) {
  const { go } = useListNav();
  const qc = useQueryClient();
  const toast = useToast();
  const write = useMapWrite(map.id);
  const [settings, setSettings] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  // Whether the open card has unsaved edits. Lifted here because adding a
  // card "from" it must not rewrite its options underneath those edits.
  const [dirty, setDirty] = useState(false);
  // A navigation held back because the open card has unsaved edits.
  const [held, setHeld] = useState<(() => void) | null>(null);

  /** Run a navigation that would unmount the card editor, asking first when
   *  it holds unsaved edits. */
  function guarded(nav: () => void) {
    if (dirty) setHeld(() => nav);
    else nav();
  }

  const open =
    map.nodes.find((n) => n.slug === cardSlug) ??
    map.nodes.find((n) => n.slug === RECALL_ENTRY_SLUG) ??
    map.nodes[0] ??
    null;
  const pendingPrompts = map.nodes.filter((n) => n.promptPending).length;

  function openCard(slug: string) {
    go({ view: null, card: slug === RECALL_ENTRY_SLUG ? null : slug });
  }
  function openCardGuarded(slug: string) {
    if (slug === open?.slug && view === 'cards') return;
    guarded(() => openCard(slug));
  }

  async function publish(published: boolean) {
    const res = await write.run(
      (version) =>
        apiSend<RecallWriteResultDTO>(`/api/recall/maps/${map.id}`, 'PATCH', {
          published,
          version,
        }),
      published ? 'Could not publish the map.' : 'Could not unpublish the map.',
    );
    if (res) toast.success(published ? 'Published. Agents can find this map now.' : 'Unpublished.');
  }

  async function deleteMap() {
    try {
      await apiSend(`/api/recall/maps/${map.id}`, 'DELETE');
      setDeleting(false);
      await qc.invalidateQueries({ queryKey: recallKeys.maps });
      toast.success('Map deleted.');
      go({ selected: null, card: null, view: null });
    } catch (err) {
      toast.error(writeErrorText(err, 'Could not delete the map.'));
    }
  }

  async function move(slug: string, dir: -1 | 1) {
    const slugs = moveCard(map.nodes, slug, dir);
    if (!slugs) return;
    await write.run(
      (version) =>
        apiSend<RecallWriteResultDTO>(`/api/recall/maps/${map.id}/cards/reorder`, 'POST', {
          slugs,
          version,
        }),
      'Could not move the card.',
    );
  }

  // "Link from" for a new card: read the open card fresh (the list shape has
  // no body) and write it back whole, with one more option.
  async function linkFrom(fromSlug: string, targetSlug: string, label: string) {
    const card = await apiFetch<{ card: RecallCardDetailDTO }>(
      `/api/recall/maps/${map.id}/cards/${fromSlug}`,
    ).then((r) => r.card);
    const edits = withOption(editsOf(card), { label, useWhen: '', targetSlug });
    await write.run(
      (version) =>
        apiSend<RecallWriteResultDTO>(
          `/api/recall/maps/${map.id}/cards/${fromSlug}`,
          'PUT',
          cardWriteBody(edits, version),
        ),
      'The card was added, but the option to it was not. Add it from the options list.',
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
            <span className="min-w-0 truncate">{map.title}</span>
            {!map.published && <StatePill state="draft" />}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{map.slug}</span>
            {map.folder && <> in {map.folder}</>}
            {' · '}
            {map.enterWhen}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {map.published ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => publish(false)}
              disabled={write.pending}
            >
              Unpublish
            </Button>
          ) : (
            <Button size="sm" onClick={() => publish(true)} disabled={write.pending}>
              Publish
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Map settings"
            onClick={() => setSettings(true)}
          >
            <Settings2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete map"
            className="text-muted-foreground hover:text-destructive-ink"
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </header>

      {!map.published && (
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          Draft: no agent can see this map until it is published. An agent created it, or it was
          unpublished.
        </p>
      )}

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Tabs
          value={view}
          onValueChange={(v) => guarded(() => go({ view: v === 'cards' ? null : v }))}
        >
          <TabsList>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="revisions">Revisions</TabsTrigger>
          </TabsList>
        </Tabs>
        {pendingPrompts > 0 && (
          <span className="flex items-center gap-1 text-xs text-info-ink">
            <Sparkles className="size-3.5" aria-hidden />
            {pendingPrompts} prompt {pendingPrompts === 1 ? 'request' : 'requests'} to review
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {view === 'graph' ? (
          <RecallGraph
            map={map}
            onEditNode={(n) => openCardGuarded(n.slug)}
            className="h-full rounded-none border-none"
          />
        ) : view === 'revisions' ? (
          <RevisionsPanel map={map} write={write} />
        ) : (
          <div className="flex h-full min-h-0 flex-col md:flex-row">
            <CardList
              nodes={map.nodes}
              openSlug={open?.slug ?? null}
              onOpen={openCardGuarded}
              onMove={move}
              onAdd={() => setAdding(true)}
              busy={write.pending}
              full={map.nodes.length >= 100}
            />
            <div className="min-h-0 min-w-0 flex-1">
              {open ? (
                <CardEditor
                  key={open.slug}
                  map={map}
                  node={open}
                  catalog={catalog}
                  write={write}
                  onDirtyChange={setDirty}
                  onDeleted={() => openCard(RECALL_ENTRY_SLUG)}
                />
              ) : (
                <p className="p-6 text-sm text-muted-foreground">This map has no cards.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {settings && <MapSettingsDialog map={map} write={write} open onOpenChange={setSettings} />}
      {adding && (
        <AddCardDialog
          mapId={map.id}
          from={open ? { slug: open.slug, title: open.title } : null}
          write={write}
          open
          onOpenChange={setAdding}
          onAdded={(slug) => openCardGuarded(slug)}
          linkFrom={open && !dirty ? (slug, title) => linkFrom(open.slug, slug, title) : null}
        />
      )}
      <AlertDialog
        open={held !== null}
        onOpenChange={(o) => {
          if (!o) setHeld(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The open card has edits that are not saved. Leaving it throws them away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const nav = held;
                setHeld(null);
                setDirty(false);
                nav?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {map.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the map and all {map.nodes.length}{' '}
              {map.nodes.length === 1 ? 'card' : 'cards'} for good. Options on other maps that lead
              here stop working. There is no restore for a deleted map.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteMap}>Delete map</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The card column: in order, entry first. Up and down move one step; the
 *  entry card never moves. */
function CardList({
  nodes,
  openSlug,
  onOpen,
  onMove,
  onAdd,
  busy,
  full,
}: {
  nodes: RecallNodeDTO[];
  openSlug: string | null;
  onOpen: (slug: string) => void;
  onMove: (slug: string, dir: -1 | 1) => void;
  onAdd: () => void;
  busy: boolean;
  full: boolean;
}) {
  return (
    <div className="flex max-h-64 shrink-0 flex-col border-b border-border md:max-h-none md:w-64 md:border-r md:border-b-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {nodes.length} {nodes.length === 1 ? 'card' : 'cards'}
        </span>
        <Button
          size="2xs"
          variant="outline"
          onClick={onAdd}
          disabled={full}
          title={full ? 'A map holds at most 100 cards.' : undefined}
        >
          <Plus /> Card
        </Button>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {nodes.map((n, i) => {
          const entry = n.slug === RECALL_ENTRY_SLUG;
          return (
            <li key={n.id} className="group flex items-center gap-1">
              <RowButton
                onClick={() => onOpen(n.slug)}
                aria-current={n.slug === openSlug ? 'true' : undefined}
                className={cn(
                  'min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted',
                  n.slug === openSlug && 'bg-muted',
                )}
              >
                <span className="block truncate text-sm">{n.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {entry && <span className="font-medium text-primary-ink">entry</span>}
                  {n.kind === 'prompt' && <span className="text-info-ink">prompt</span>}
                  {n.promptPending && <span className="text-info-ink">prompt requested</span>}
                  <span className="truncate font-mono">{n.slug}</span>
                </span>
              </RowButton>
              {!entry && (
                <div className="flex shrink-0 flex-col opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-2xs"
                    aria-label={`Move ${n.title} up`}
                    disabled={busy || i <= 1}
                    onClick={() => onMove(n.slug, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-2xs"
                    aria-label={`Move ${n.title} down`}
                    disabled={busy || i >= nodes.length - 1}
                    onClick={() => onMove(n.slug, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
