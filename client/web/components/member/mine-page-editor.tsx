'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useToast } from '@mantle/web-ui/ui/toast';
import { PageEditor } from '@/components/page-editor/page-editor';
import { versionFailureText } from '@/lib/member-autosave';
import { clientAssetPath } from '@/lib/client-portal';
import { isAdminSpace, isClientSpace } from '@/lib/member-space';
import { memberFolderIndex } from '@/lib/member-folder-index';
import { useReaderTreeServes } from '@/components/item-tree/use-tree-kinds';
import type { MemberEditorProps } from './member-editor';
import { useSpaceApi } from './space-api';
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
  readOnly = false,
}: MemberEditorProps & {
  /** `folderId`: the folder the draft sits in (null at the member's top
   *  level; folder phase 7). Read as a local optional: the pinned contract
   *  does not name it yet, and a brain before the pages tree does not send
   *  it (undefined = not known). */
  page: { doc: Doc; draft: Doc | null; draftRev?: number; folderId?: string | null };
}) {
  const toast = useToast();
  const api = useSpaceApi();
  // An admin's private page may embed any brain item the admin can see, so
  // it keeps the owner editor's embeds (see PageEditor `privateItem`).
  const admin = isAdminSpace(api);
  // A client's own page reads its pictures from the client routes (client
  // tier audit U2), as its read-only view does.
  const client = isClientSpace(api);
  // The Folder index block: `here` is the draft's own folder in the
  // member's tree, and the slash item shows only when that tree serves
  // pages and the folder is known (lib/member-folder-index.ts).
  const treeServesPages = useReaderTreeServes('member', 'pages');
  const folder = memberFolderIndex({
    space: admin ? 'admin' : client ? 'client' : 'member',
    treeServesPages,
    folderId: page.folderId,
  });
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
      const res = await api.draft(id, { doc, if_rev: rev });
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
      const saved = await api.save(id, { doc, if_rev: rev });
      return { rev: saved.body.type === 'page' ? (saved.body.page.draftRev ?? rev) : rev };
    });
    if (!res.ok) {
      // A refusal already said its piece through the queue's state.
      const text = versionFailureText(res.failure);
      if (text) toast.error(text);
      return false;
    }
    hasDraftRef.current = false;
    onUnsavedChange(queue.isDirty());
    toast.success('Version saved.');
    onSaved();
    return true;
  }, [api, id, onSaved, onUnsavedChange, queue, toast]);

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
      member={!admin}
      mapAssetPath={client ? clientAssetPath : undefined}
      privateItem={admin}
      pageId={id}
      folderId={folder.folderId}
      folderIndex={folder.folderIndex}
      editable={!readOnly}
      content={initial as JSONContent}
      onChange={(doc) => {
        docRef.current = doc as Doc;
        queue.changed();
      }}
      onBlur={() => void queue.flush()}
    />
  );
}
