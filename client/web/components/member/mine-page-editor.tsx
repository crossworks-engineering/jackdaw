'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useToast } from '@mantle/web-ui/ui/toast';
import { PageEditor } from '@/components/page-editor/page-editor';
import { memberSpace } from '@/lib/member-space';
import type { MemberEditorProps } from './member-editor';
import { useMemberAutosave } from './use-member-autosave';

type Doc = Record<string, unknown>;

const AUTOSAVE_MS = 800;

/**
 * A member's own page (member logins, Phase 2): the owner's editor on the
 * member routes. The working copy autosaves into the draft through the shared
 * queue (one write at a time, dirty by snapshot, flushed on every way out);
 * Save version publishes it, in the same chain, so the two never race one
 * etag.
 */
export function MinePageEditor({
  id,
  page,
  handleRef,
  onUnsavedChange,
  onSaved,
  onStatus,
}: MemberEditorProps & {
  page: { doc: Doc; draft: Doc | null; draftRev?: number };
}) {
  const toast = useToast();
  const initial = (page.draft ?? page.doc) as Doc;
  const docRef = useRef<Doc>(initial);
  // The server holds a draft the saved version does not have yet.
  const hasDraftRef = useRef(page.draft != null);

  const queue = useMemberAutosave<Doc>({
    id,
    read: () => docRef.current,
    saved: initial,
    rev: page.draftRev ?? 0,
    send: async (doc, rev) => {
      const res = await memberSpace.draft(id, { doc, if_rev: rev });
      return { rev: res.draft_rev };
    },
    debounceMs: AUTOSAVE_MS,
    onSaved: () => {
      hasDraftRef.current = true;
    },
    onState: (s) => {
      onStatus?.(s);
      onUnsavedChange(hasDraftRef.current || s.status !== 'saved');
    },
  });

  const saveVersion = useCallback(async (): Promise<boolean> => {
    const res = await queue.commit(async (doc, rev) => {
      const saved = await memberSpace.save(id, { doc, if_rev: rev });
      return { rev: saved.body.type === 'page' ? (saved.body.page.draftRev ?? rev) : rev };
    });
    if (!res.ok) {
      // A refusal already said its piece through the queue's state.
      if (res.failure.kind === 'network') {
        toast.error('Could not save the version. Check your connection.');
      }
      return false;
    }
    hasDraftRef.current = false;
    onUnsavedChange(queue.isDirty());
    toast.success('Version saved.');
    onSaved();
    return true;
  }, [id, onSaved, onUnsavedChange, queue, toast]);

  useEffect(() => {
    handleRef.current = { flush: () => queue.flush(), saveVersion };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, queue, saveVersion]);

  useEffect(() => {
    onUnsavedChange(hasDraftRef.current);
    // Once on mount: what the loaded item says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageEditor
      member
      pageId={id}
      content={initial as JSONContent}
      onChange={(doc) => {
        docRef.current = doc as Doc;
        queue.changed();
      }}
      onBlur={() => void queue.flush()}
    />
  );
}
