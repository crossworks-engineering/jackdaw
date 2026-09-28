'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, X } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { useToast } from '@mantle/web-ui/ui/toast';
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
import { memberSavesSettled, type AutosaveState } from '@/lib/member-autosave';
import { replayRescue } from '@/lib/member-rescue';
import { acceptedBrainHref } from '@/lib/admin-private';
import {
  adminSpace,
  commentsOpen,
  isAdminSpace,
  isEditable,
  type SpaceItem,
} from '@/lib/member-space';
import { AcceptIntoBrainDialog } from '@/components/team-admin/review-dialogs';
import { ReviewActions, SharingControl, StatusChip, spaceErrorMessage } from './space-status';
import { useSpaceApi } from './space-api';
import { SpaceComments } from './space-comments';
import { SpaceItemView } from './space-item-view';
import { MemberDrawEditor } from './member-draw-editor';
import { MemberTableEditor } from './member-table-editor';
import { MineNoteEditor } from './mine-note-editor';
import { MinePageEditor } from './mine-page-editor';
import type { MemberEditorHandle } from './member-editor';

/**
 * One of the member's OWN items (member logins Phase 2): edit it (pages,
 * notes, drawings and tables; files are upload and download only), Save
 * version (what teammates and a reviewer see), share it with the team or keep
 * it private, submit it for review or recall it, discuss it, delete it.
 * A submitted item is frozen: read-only until Recall, Accept or Return.
 *
 * Under an `adminSpace` provider it is an ADMIN's own private item (Phase
 * 7): the same editors on the admin routes, Save version and Delete, and
 * "Accept into brain" in place of sharing, review and the discussion, none
 * of which an item only its admin sees has.
 */
export function MineItem({ id, onClose }: { id: string; onClose: () => void }) {
  const api = useSpaceApi();
  const admin = isAdminSpace(api);
  const q = useQuery({
    queryKey: admin ? ['admin-space-item', id] : ['member-space-item', 'mine', id],
    // An editor that just closed on this item may still be saving what was
    // typed before it left: read after that save, not before it.
    queryFn: async () => {
      await memberSavesSettled(id);
      // A big save a reload cut off last time goes first (member-rescue.ts).
      await replayRescue(id, Date.now(), api.base);
      return api.item(id);
    },
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
    // Always read on open, whatever the app's staleTime: the editor seeds
    // from this read (see the wait below).
    refetchOnMount: 'always',
  });
  // Bumped by Reload (after a conflict): a fresh editor on the brain's copy.
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(async () => {
    await q.refetch();
    setGeneration((g) => g + 1);
  }, [q]);
  // A failed background refetch keeps the data it had (react-query v5): only
  // an item that never loaded is an error screen.
  if (q.isError && !q.data) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {gone ? 'This item is gone.' : 'Could not load this item.'}
        </p>
      </div>
    );
  }
  // Wait for this mount's own read too: a cached copy can predate the save
  // an editor made on its way out, and an editor seeded from it would show
  // the old text and write it back over the saved words.
  if (!q.data || !q.isFetchedAfterMount) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  // Keyed on the id: a new item gets a fresh editor, never a reused one.
  return (
    <MineItemLoaded
      key={`${id}:${generation}`}
      item={q.data}
      onClose={onClose}
      onReload={() => void reload()}
    />
  );
}

/** Why the working copy is not on the brain, when that needs saying. */
function AutosaveNote({ state, onReload }: { state: AutosaveState; onReload: () => void }) {
  let text: string | null = null;
  if (state.status === 'retrying') text = 'Not saved yet: trying again…';
  else if (state.status === 'failed' || state.status === 'stopped') text = state.message;
  if (!text) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">{text}</span>
      {state.status === 'stopped' && state.reason === 'conflict' ? (
        <Button size="sm" variant="outline" onClick={onReload}>
          Reload
        </Button>
      ) : null}
    </div>
  );
}

function MineItemLoaded({
  item,
  onClose,
  onReload,
}: {
  item: SpaceItem;
  onClose: () => void;
  onReload: () => void;
}) {
  const { row, body } = item;
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const api = useSpaceApi();
  const admin = isAdminSpace(api);
  const editable = isEditable(row);
  const [title, setTitle] = useState(row.title);
  const refreshLists = useCallback(() => {
    if (admin) {
      void qc.invalidateQueries({ queryKey: ['admin-space-list'] });
      return;
    }
    void qc.invalidateQueries({ queryKey: ['member-space-list'] });
    void qc.invalidateQueries({ queryKey: ['member-home'] });
  }, [admin, qc]);
  const refreshItem = useCallback(
    () =>
      void qc.invalidateQueries({ queryKey: [admin ? 'admin-space-item' : 'member-space-item'] }),
    [admin, qc],
  );

  // ── The editor (page, note, drawing, table) owns its working copy and its
  // autosave (the shared queue); this row drives it through the handle. ────
  const editorHandle = useRef<MemberEditorHandle | null>(null);
  const [editorUnsaved, setEditorUnsaved] = useState(false);
  const unsavedRef = useRef(false);
  const onUnsavedChange = useCallback((unsaved: boolean) => {
    unsavedRef.current = unsaved;
    setEditorUnsaved(unsaved);
  }, []);
  const [editorSaving, setEditorSaving] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>({ status: 'saved' });
  const onStatus = useCallback(
    (state: AutosaveState) => {
      setAutosave(state);
      // Frozen or out of draft elsewhere: show the item as it now stands.
      if (state.status === 'stopped' && state.reason !== 'conflict') refreshItem();
    },
    [refreshItem],
  );
  const saveEditorVersion = async (): Promise<boolean> => {
    const h = editorHandle.current;
    if (!h) return false;
    setEditorSaving(true);
    try {
      return await h.saveVersion();
    } finally {
      setEditorSaving(false);
    }
  };

  const saveTitle = () => {
    const t = title.trim();
    if (t === row.title) return;
    api
      .patch(row.id, { title: t })
      .then(() => {
        refreshLists();
        refreshItem();
      })
      .catch((err) => toast.error(spaceErrorMessage(err, 'Could not rename it.')));
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = async () => {
    try {
      await api.remove(row.id);
      toast.success('Deleted.');
      refreshLists();
      onClose();
    } catch (err) {
      toast.error(spaceErrorMessage(err, 'Could not delete it.'));
    }
  };

  // Submit takes the SAVED version: everything typed goes to the brain first
  // (awaited, for notes too), then a Save version when the saved version is
  // behind. A refusal on the way stops the submit.
  const beforeSubmit = async () => {
    const h = editorHandle.current;
    if (!h) return true;
    if (!(await h.flush())) return false;
    return unsavedRef.current ? saveEditorVersion() : true;
  };

  const editorProps = {
    id: row.id,
    handleRef: editorHandle,
    onUnsavedChange,
    onSaved: refreshLists,
    onStatus,
  };
  let editor: React.ReactNode;
  if (!editable) {
    editor = <SpaceItemView source="mine" item={item} />;
  } else if (body.type === 'page') {
    editor = <MinePageEditor {...editorProps} page={body.page} />;
  } else if (body.type === 'note') {
    editor = <MineNoteEditor {...editorProps} content={body.note.content} />;
  } else if (body.type === 'draw') {
    editor = <MemberDrawEditor {...editorProps} draw={body.draw} />;
  } else if (body.type === 'table') {
    editor = <MemberTableEditor {...editorProps} table={body.table} />;
  } else {
    editor = <SpaceItemView source="mine" item={item} />;
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="space-y-4 p-6">
        <div className="flex items-start gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            disabled={!editable}
            placeholder="Untitled"
            aria-label="Title"
            // The owner page title's look: no box, an underline while editing.
            className="h-auto min-w-0 flex-1 rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 py-0.5 text-lg font-semibold shadow-none transition-colors placeholder:text-muted-foreground/40 focus-visible:border-primary focus-visible:ring-0 disabled:opacity-100 md:text-lg"
          />
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip row={row} />
          <span className="flex-1" />
          {admin ? null : <SharingControl row={row} />}
          {(body.type === 'page' || body.type === 'draw' || body.type === 'table') && editable ? (
            <Button
              size="sm"
              variant="outline"
              disabled={editorSaving || !editorUnsaved}
              onClick={() => void saveEditorVersion()}
              title={
                admin
                  ? 'Save a version: what goes into the brain when you accept it'
                  : 'Save a version: what teammates and a reviewer see'
              }
            >
              <Save /> {editorSaving ? 'Saving…' : 'Save version'}
            </Button>
          ) : null}
          {admin ? (
            <AcceptIntoBrainDialog
              item={row}
              triggerLabel="Accept into brain"
              description={
                <>
                  “{row.title || 'Untitled'}” leaves your private space and becomes a brain item at
                  the level you pick. Its saved version goes in.
                </>
              }
              // The saved version goes in: what was typed is saved first.
              beforeAccept={beforeSubmit}
              accept={(input) => adminSpace.accept(row.id, input)}
              onAccepted={(res, input) => {
                refreshLists();
                router.push(acceptedBrainHref(row.type, res.id, input.folderPath));
              }}
              errorMessage={spaceErrorMessage}
            />
          ) : (
            <ReviewActions row={row} beforeSubmit={beforeSubmit} />
          )}
          {editable ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete"
              title="Delete"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>

        {row.reviewState === 'returned' && row.returnedNote ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <p className="font-medium">Returned by the reviewer</p>
            <p className="mt-1 whitespace-pre-wrap">{row.returnedNote}</p>
          </div>
        ) : null}
        {row.reviewState === 'submitted' ? (
          <p className="text-sm text-muted-foreground">
            Submitted for review: nobody can change it now. Recall it to make a correction.
          </p>
        ) : null}

        {editable ? <AutosaveNote state={autosave} onReload={onReload} /> : null}

        {editor}

        {!admin && commentsOpen(row) ? <SpaceComments source="mine" id={row.id} /> : null}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{row.title || 'Untitled'}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {admin
                ? 'It is removed from your private space for good. This cannot be undone.'
                : 'It is removed from your space for good. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
