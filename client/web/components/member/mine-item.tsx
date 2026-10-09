'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
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
import {
  clientSaveText,
  holdsEditor,
  memberSavesSettled,
  type AutosaveState,
} from '@/lib/member-autosave';
import { replayRescue } from '@/lib/member-rescue';
import {
  acceptedBrainHref,
  canDeletePrivate,
  canGiveBack,
  privateDeleteMessage,
  takenFromOf,
} from '@/lib/admin-private';
import {
  CLIENT_WITH_REVIEWER_TEXT,
  WITH_ADMIN_TEXT,
  adminSpace,
  frozenByOther,
  isAdminSpace,
  isClientSpace,
  isEditable,
  isWithAdminRefusal,
  unsavedBundleIds,
  type AdminSpaceItemRow,
  type SpaceItem,
} from '@/lib/member-space';
import { AcceptIntoBrainDialog } from '@/components/team-admin/review-dialogs';
import { ReviewActions, SharingControl, StatusChip, spaceErrorMessage } from './space-status';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { CLIENT_REQUESTS_KEY } from '@/lib/client-requests';
import { useSpaceApi } from './space-api';
import { SpaceItemView } from './space-item-view';
import { MemberDrawEditor } from './member-draw-editor';
import { MemberTableEditor } from './member-table-editor';
import { MineNoteEditor } from './mine-note-editor';
import { MinePageEditor } from './mine-page-editor';
import { GiveBackDialog } from './give-back-dialog';
import { ItemLinksNotice, ownItemResolver } from './item-links-notice';
import type { MemberEditorHandle } from './member-editor';

/**
 * One of the member's OWN items (member logins Phase 2): edit it (pages,
 * notes, drawings and tables; files are upload and download only), Save
 * version (what teammates and a reviewer see), share it with the team or keep
 * it private, submit it for review or recall it, discuss it, delete it.
 * A submitted item is frozen: read-only until Recall, Accept or Return.
 *
 * Under a `clientSpace` provider it is a CLIENT's own item (client logins
 * C5): the same editors on the client routes, Save version, Submit, Recall,
 * Delete and the review talk while submitted; never sharing (a client has no
 * Team drafts).
 *
 * Under an `adminSpace` provider it is an ADMIN's own private item (Phase
 * 7): the same editors on the admin routes, Save version and Delete, and
 * "Accept into brain" in place of sharing, review and the discussion, none
 * of which an item only its admin sees has.
 */
export function MineItem({
  id,
  onClose,
  withAdmin = false,
}: {
  id: string;
  onClose: () => void;
  /** The list already says an admin holds it: nothing to read (audit F07). */
  withAdmin?: boolean;
}) {
  const api = useSpaceApi();
  const admin = isAdminSpace(api);
  const q = useQuery({
    enabled: !withAdmin,
    queryKey: admin ? ['admin-space-item', id] : ['member-space-item', 'mine', id],
    // An editor that just closed on this item may still be saving what was
    // typed before it left: read after that save, not before it.
    queryFn: async () => {
      await memberSavesSettled(id);
      // A big save a reload cut off last time goes first (member-rescue.ts).
      await replayRescue(id, Date.now(), api.base);
      return api.item(id);
    },
    retry: (count, err) =>
      !(err instanceof ApiError && (err.status === 404 || err.status === 409)) && count < 1,
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
  // An admin took it over (the list said so, or the brain answered 409
  // `with-admin`, also on a refetch after the take-over): no content, no
  // editor, whatever this view showed before.
  if (withAdmin || isWithAdminRefusal(q.error)) {
    return <WithAdminNotice onClose={onClose} client={isClientSpace(api)} />;
  }
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

/** An own item an admin has taken over (audit F07): the member reads none
 *  of it until it is accepted (it shows under Accepted) or given back. A
 *  client reads it in its own words: "the reviewer", "with the team" (audit
 *  U3: a client never reads a staff role). */
export function WithAdminNotice({
  onClose,
  client = false,
}: {
  onClose: () => void;
  client?: boolean;
}) {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start gap-2">
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="size-3" aria-hidden /> {client ? 'With the team' : 'With admin'}
        </Badge>
        <span className="flex-1" />
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {client ? CLIENT_WITH_REVIEWER_TEXT : WITH_ADMIN_TEXT}
      </p>
    </div>
  );
}

/**
 * The editor is held because the item renders inside another one the member
 * submitted (audit F04): name that item and link to it, where Recall is.
 */
function FrozenByNotice({ holderId, onRelease }: { holderId: string; onRelease: () => void }) {
  const api = useSpaceApi();
  const holder = useQuery({
    queryKey: ['named-item', holderId],
    queryFn: () => ownItemResolver(api)(holderId),
    retry: false,
    staleTime: 30_000,
  });
  const title = holder.data ? `“${holder.data.title || 'Untitled'}”` : 'an item';
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">
        This is part of{' '}
        {holder.data?.href ? (
          <Link href={holder.data.href} className="font-medium underline underline-offset-4">
            {title}
          </Link>
        ) : (
          title
        )}
        , which you submitted. Recall it to edit. What you typed stays below, read-only, so you can
        copy it.
      </span>
      <Button size="sm" variant="outline" onClick={onRelease}>
        Show it as it is now
      </Button>
    </div>
  );
}

/** Why the working copy is not on the brain, when that needs saying. */
function AutosaveNote({
  state,
  onReload,
  client,
}: {
  state: AutosaveState;
  onReload: () => void;
  client: boolean;
}) {
  let text: string | null = null;
  if (state.status === 'retrying') text = 'Not saved yet: trying again…';
  else if (state.status === 'failed' || state.status === 'stopped') text = state.message;
  if (!text) return null;
  // A client reads no staff role (client tier audit U6).
  if (client) text = clientSaveText(text);
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
  const client = isClientSpace(api);
  const editable = isEditable(row);
  // An item this admin took over from the Review queue (audit F07): who
  // wrote it, and whether it can still go back to them.
  const takenFrom = admin ? takenFromOf(row as AdminSpaceItemRow) : null;
  const deletable = !admin || canDeletePrivate(row as AdminSpaceItemRow);
  // Items shown inside this one that Submit wants saved first (audit F04).
  const [mustSave, setMustSave] = useState<string[]>([]);
  const onSubmitRefused = (err: unknown) => {
    const ids = unsavedBundleIds(err, row.id);
    setMustSave(ids);
    return ids.length > 0;
  };
  const [title, setTitle] = useState(row.title);
  const refreshLists = useCallback(() => {
    if (admin) {
      void qc.invalidateQueries({ queryKey: ['admin-space-list'] });
      // Private items list inside the kind's own screen too (item-list
      // alignment): its list shows the new title, or the item gone.
      void qc.invalidateQueries({ queryKey: [MEMBER_KIND[row.type].listKey] });
      return;
    }
    void qc.invalidateQueries({ queryKey: ['member-space-list'] });
    void qc.invalidateQueries({ queryKey: ['member-home'] });
    // A client's My requests (client logins C5).
    void qc.invalidateQueries({ queryKey: CLIENT_REQUESTS_KEY });
  }, [admin, qc, row.type]);
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
  const onStatus = useCallback((state: AutosaveState) => setAutosave(state), []);
  // Frozen or out of draft elsewhere: the editor stays, read-only, with what
  // was typed, until the member lets it go (then the item shows as it now
  // stands). Once per open item: after that the row decides.
  const [held, setHeld] = useState(false);
  const [released, setReleased] = useState(false);
  if (!held && !released && holdsEditor(autosave, editable)) setHeld(true);
  const release = () => {
    setHeld(false);
    setReleased(true);
    refreshItem();
  };
  // Held because the item renders inside another submitted one (audit F04).
  const holderId =
    autosave.status === 'stopped'
      ? frozenByOther(autosave.reason, autosave.ids ?? [], row.id)
      : null;
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

  // The rename in flight (or done), so Submit can wait for it and a blur and
  // a Submit do not send the same title twice.
  const titleSave = useRef<{ title: string; done: Promise<boolean> } | null>(null);
  const saveTitle = (): Promise<boolean> => {
    const t = title.trim();
    const last = titleSave.current;
    if (last ? last.title === t : t === row.title) return last?.done ?? Promise.resolve(true);
    const done = api.patch(row.id, { title: t }).then(
      () => {
        refreshLists();
        refreshItem();
        return true;
      },
      (err: unknown) => {
        toast.error(spaceErrorMessage(err, 'Could not rename it.'));
        titleSave.current = null;
        return false;
      },
    );
    titleSave.current = { title: t, done };
    return done;
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = async () => {
    try {
      await api.remove(row.id);
      toast.success('Deleted.');
      refreshLists();
      onClose();
    } catch (err) {
      toast.error(privateDeleteMessage(err) ?? spaceErrorMessage(err, 'Could not delete it.'));
      refreshItem();
    }
  };

  // Submit takes the SAVED version: the title and everything typed go to the
  // brain first (awaited, for notes too), then a Save version when the saved
  // version is behind. A refusal on the way stops the submit. (The title
  // saved on blur, unawaited, and could race the freeze.)
  const beforeSubmit = async () => {
    if (!(await saveTitle())) return false;
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
    readOnly: held,
  };
  let editor: React.ReactNode;
  if (!editable && !held) {
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
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            disabled={!editable || held}
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
          {takenFrom ? (
            <Badge variant="secondary" className="gap-1" title="Taken over from the Review queue">
              <UserRound className="size-3" aria-hidden /> From {takenFrom.name}
            </Badge>
          ) : null}
          <span className="flex-1" />
          {admin || client ? null : <SharingControl row={row} />}
          {(body.type === 'page' || body.type === 'draw' || body.type === 'table') &&
          editable &&
          !held ? (
            <Button
              size="sm"
              variant="outline"
              disabled={editorSaving || !editorUnsaved}
              onClick={() => void saveEditorVersion()}
              title={
                admin
                  ? 'Save a version: what goes into the brain when you accept it'
                  : client
                    ? 'Save a version: what a reviewer sees'
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
                takenFrom ? (
                  <>
                    “{row.title || 'Untitled'}” by {takenFrom.name} leaves your private space and
                    becomes a brain item at the level you pick, with everything you took over with
                    it. Its saved version goes in, and {takenFrom.name} sees it under Accepted.
                  </>
                ) : (
                  <>
                    “{row.title || 'Untitled'}” leaves your private space and becomes a brain item
                    at the level you pick. Its saved version goes in.
                  </>
                )
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
            <ReviewActions row={row} beforeSubmit={beforeSubmit} onRefused={onSubmitRefused} />
          )}
          {takenFrom && canGiveBack(row as AdminSpaceItemRow) ? (
            <GiveBackDialog
              row={row}
              from={takenFrom}
              // What was typed goes with it: the brain refuses unsaved edits.
              beforeGiveBack={beforeSubmit}
              onGivenBack={() => {
                refreshLists();
                onClose();
              }}
              onRefused={() => {
                refreshLists();
                refreshItem();
              }}
            />
          ) : null}
          {editable && !held && deletable ? (
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

        {/* No reviewer note (review flows carry no messages, 2026-10-09). */}
        {row.reviewState === 'returned' ? (
          <p className="text-sm text-muted-foreground">
            Sent back by the reviewer. Change it and submit it again.
          </p>
        ) : null}
        {row.reviewState === 'submitted' ? (
          <p className="text-sm text-muted-foreground">
            Submitted for review: nobody can change it now. Recall it to make a correction.
          </p>
        ) : null}

        {takenFrom && !takenFrom.canGiveBack ? (
          <p className="text-sm text-muted-foreground">
            {takenFrom.name} cannot take this back any more. Accept it into the brain, or delete it.
          </p>
        ) : null}

        {mustSave.length ? (
          <ItemLinksNotice
            message="These are shown in this item and have unsaved changes. Save a version of each, then submit:"
            ids={mustSave}
            resolve={ownItemResolver(api)}
          />
        ) : null}

        {held && holderId ? (
          <FrozenByNotice holderId={holderId} onRelease={release} />
        ) : held ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1">
              {autosave.status === 'stopped'
                ? client
                  ? clientSaveText(autosave.message)
                  : autosave.message
                : 'This item cannot be changed here any more.'}{' '}
              What you typed stays below, read-only, so you can copy it.
            </span>
            <Button size="sm" variant="outline" onClick={release}>
              Show it as it is now
            </Button>
          </div>
        ) : editable ? (
          <AutosaveNote state={autosave} onReload={onReload} client={client} />
        ) : null}

        {editor}
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
