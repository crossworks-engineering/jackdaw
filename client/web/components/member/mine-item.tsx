'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, X } from 'lucide-react';
import type { JSONContent } from '@tiptap/react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Textarea } from '@mantle/web-ui/ui/textarea';
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
import { PageEditor } from '@/components/page-editor/page-editor';
import { commentsOpen, isEditable, memberSpace, type SpaceItem } from '@/lib/member-space';
import { ReviewActions, SharingControl, StatusChip, spaceErrorMessage } from './space-status';
import { SpaceComments } from './space-comments';
import { SpaceItemView } from './space-item-view';

const AUTOSAVE_MS = 800;

type Doc = Record<string, unknown>;

/**
 * One of the member's OWN items (member logins Phase 2): edit it (pages and
 * notes here; drawings, tables and files open read-only for now), Save
 * version (what teammates and a reviewer see), share it with the team or keep
 * it private, submit it for review or recall it, discuss it, delete it.
 * A submitted item is frozen: read-only until Recall, Accept or Return.
 */
export function MineItem({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['member-space-item', 'mine', id],
    queryFn: () => memberSpace.get('mine', id),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {gone ? 'This item is gone.' : 'Could not load this item.'}
        </p>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  // Keyed on the id: a new item gets a fresh editor, never a reused one.
  return <MineItemLoaded key={id} item={q.data} onClose={onClose} />;
}

function MineItemLoaded({ item, onClose }: { item: SpaceItem; onClose: () => void }) {
  const { row, body } = item;
  const toast = useToast();
  const qc = useQueryClient();
  const editable = isEditable(row);
  const [title, setTitle] = useState(row.title);
  const refreshLists = () => {
    void qc.invalidateQueries({ queryKey: ['member-space-list'] });
    void qc.invalidateQueries({ queryKey: ['member-home'] });
  };
  const refreshItem = () => void qc.invalidateQueries({ queryKey: ['member-space-item'] });

  // ── Page: the working copy autosaves as a draft; Save version publishes. ──
  const pageDoc = useRef<Doc | null>(
    body.type === 'page' ? ((body.page.draft ?? body.page.doc) as Doc) : null,
  );
  const rev = useRef<number>(body.type === 'page' ? (body.page.draftRev ?? 0) : 0);
  const [unsaved, setUnsaved] = useState(body.type === 'page' && body.page.draft != null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDraft = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty || !pageDoc.current) return true;
    try {
      const res = await memberSpace.draft(row.id, { doc: pageDoc.current, if_rev: rev.current });
      rev.current = res.draft_rev;
      setDirty(false);
      setUnsaved(true);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(spaceErrorMessage(err, 'This page changed elsewhere. Reload it.'));
      } else {
        toast.error('Could not autosave. Check your connection.');
      }
      return false;
    }
  }, [dirty, row.id, toast]);

  useEffect(() => {
    if (!dirty) return;
    timer.current = setTimeout(() => void flushDraft(), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dirty, flushDraft]);

  const saveVersion = async (): Promise<boolean> => {
    if (body.type !== 'page' || !pageDoc.current) return true;
    setSaving(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      const saved = await memberSpace.save(row.id, { doc: pageDoc.current, if_rev: rev.current });
      if (saved.body.type === 'page') rev.current = saved.body.page.draftRev ?? 0;
      setDirty(false);
      setUnsaved(false);
      toast.success('Version saved.');
      refreshLists();
      return true;
    } catch (err) {
      toast.error(spaceErrorMessage(err, 'Could not save the version.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Note: saves as it goes (no draft). ────────────────────────────────────
  const [noteText, setNoteText] = useState(body.type === 'note' ? body.note.content : '');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNote = (content: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      memberSpace
        .patch(row.id, { content })
        .then(refreshLists)
        .catch((err) => toast.error(spaceErrorMessage(err, 'Could not save the note.')));
    }, AUTOSAVE_MS);
  };

  const saveTitle = () => {
    const t = title.trim();
    if (t === row.title) return;
    memberSpace
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
      await memberSpace.remove(row.id);
      toast.success('Deleted.');
      refreshLists();
      onClose();
    } catch (err) {
      toast.error(spaceErrorMessage(err, 'Could not delete it.'));
    }
  };

  // Submit takes the SAVED version: save first when there is anything unsaved.
  const beforeSubmit = async () => {
    if (body.type !== 'page') return true;
    if (!(await flushDraft())) return false;
    return unsaved || dirty ? saveVersion() : true;
  };

  let editor: React.ReactNode;
  if (!editable) {
    editor = <SpaceItemView source="mine" item={item} />;
  } else if (body.type === 'page') {
    editor = (
      <PageEditor
        member
        pageId={row.id}
        content={(body.page.draft ?? body.page.doc) as JSONContent}
        onChange={(doc) => {
          pageDoc.current = doc as Doc;
          setDirty(true);
        }}
        onBlur={() => void flushDraft()}
      />
    );
  } else if (body.type === 'note') {
    editor = (
      <Textarea
        value={noteText}
        onChange={(e) => {
          setNoteText(e.target.value);
          saveNote(e.target.value);
        }}
        rows={16}
        aria-label="Note text"
        className="font-[family-name:var(--font-prose)]"
      />
    );
  } else if (body.type === 'file') {
    editor = <SpaceItemView source="mine" item={item} />;
  } else {
    editor = (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Editing {body.type === 'draw' ? 'drawings' : 'tables'} here comes next; this is your
          current copy.
        </p>
        <SpaceItemView source="mine" item={item} working />
      </div>
    );
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
          <SharingControl row={row} />
          {body.type === 'page' && editable ? (
            <Button
              size="sm"
              variant="outline"
              disabled={saving || (!dirty && !unsaved)}
              onClick={() => void saveVersion()}
              title="Save a version: what teammates and a reviewer see"
            >
              <Save /> {saving ? 'Saving…' : 'Save version'}
            </Button>
          ) : null}
          <ReviewActions row={row} beforeSubmit={beforeSubmit} />
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

        {editor}

        {commentsOpen(row) ? <SpaceComments source="mine" id={row.id} /> : null}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{row.title || 'Untitled'}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from your space for good. This cannot be undone.
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
