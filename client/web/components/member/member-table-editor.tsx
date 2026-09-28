'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import {
  diffTableDocs,
  ensureTableDoc,
  type TableDetail,
  type TableDoc,
} from '@mantle/content-core/table-model';
import { TableGrid } from '@/components/table-grid/table-grid';
import {
  SaveRefused,
  type SaveFailure,
  versionFailureText,
} from '@/lib/member-autosave';
import type { MemberEditorProps } from './member-editor';
import { useSpaceApi } from './space-api';
import { useMemberAutosave } from './use-member-autosave';

const DRAFT_DEBOUNCE_MS = 800;

/**
 * A member's own table (member logins, Phase 2): the owner's grid on the
 * member routes. Edits autosave into the draft workbook as op batches scoped
 * to the open tab (a whole document only for a single-tab table, when the
 * change cannot be written as ops); Save version publishes the draft. No
 * import, tab editing or cross-tab references here: the grid gets no table id,
 * so reference cells read as text. A table past the edit window opens
 * read-only.
 */
export function MemberTableEditor({
  id,
  table: initial,
  handleRef,
  onUnsavedChange,
  onSaved,
  onStatus,
}: MemberEditorProps & { table: TableDetail }) {
  const toast = useToast();
  const api = useSpaceApi();
  const [table, setTable] = useState(initial);
  const [doc, setDoc] = useState<TableDoc>(() => ensureTableDoc(initial.draft ?? initial.data));
  const [switching, setSwitching] = useState(false);
  const docRef = useRef(doc);
  const committedKeyRef = useRef(JSON.stringify(ensureTableDoc(initial.data)));
  const hasDraftRef = useRef(initial.draft != null);
  const tabRef = useRef(initial.tabId);
  const tabCountRef = useRef(initial.tabs?.length ?? 1);
  const clipped = table.docClipped === true;
  const fileBacked = table.tabs !== undefined;

  const report = useCallback(() => {
    onUnsavedChange(
      hasDraftRef.current || JSON.stringify(docRef.current) !== committedKeyRef.current,
    );
  }, [onUnsavedChange]);

  /** Write the working doc on top of `base` (what the brain holds): ops
   *  scoped to the open tab, or a whole document for a single-tab table
   *  when the change cannot be written as ops (a reorder). */
  const sendDraft = async (snapshot: TableDoc, rev: number, base: TableDoc) => {
    const ops = fileBacked ? diffTableDocs(base, snapshot) : null;
    if (ops !== null) {
      if (ops.length === 0) return { rev };
      const tabId = tabRef.current;
      const res = await api.draft(id, {
        ops: tabId ? ops.map((o) => ({ ...o, tabId })) : ops,
        if_rev: rev,
      });
      return { rev: res.draft_rev };
    }
    // A whole document would drop the other tabs of a multi-tab workbook.
    if (tabCountRef.current > 1) {
      throw new SaveRefused('Reordering is not supported on a table with several tabs yet.');
    }
    const res = await api.draft(id, {
      table: snapshot as unknown as Record<string, unknown>,
      if_rev: rev,
    });
    return { rev: res.draft_rev };
  };

  /** A refused op (400) would fail every later diff from the same base, and
   *  a conflict may mean the last batch is already in (a lost response):
   *  take the brain's copy of the tab as the base again rather than send the
   *  same ops twice. */
  const onFailure = (failure: SaveFailure) => {
    if ((failure.kind === 'invalid' && failure.status === 400) || failure.kind === 'conflict') {
      toast.error('Reloaded the latest copy of this table.');
      void reloadRef.current().catch(() => undefined);
    }
  };

  const queue = useMemberAutosave<TableDoc>({
    id,
    read: () => docRef.current,
    saved: docRef.current,
    rev: initial.draftRev ?? 0,
    send: sendDraft,
    debounceMs: DRAFT_DEBOUNCE_MS,
    // Ops are a diff from the base: never re-send them on a new etag.
    adoptConflicts: false,
    onFailure,
    onSaved: () => {
      hasDraftRef.current = true;
      report();
    },
    onState: onStatus,
  });

  /** Take the brain's copy of a tab as the new base. */
  const adopt = useCallback(
    (t: TableDetail) => {
      const fresh = ensureTableDoc(t.draft ?? t.data);
      setTable(t);
      setDoc(fresh);
      docRef.current = fresh;
      committedKeyRef.current = JSON.stringify(ensureTableDoc(t.data));
      hasDraftRef.current = t.draft != null;
      tabRef.current = t.tabId;
      tabCountRef.current = t.tabs?.length ?? 1;
      queue.reset(fresh, t.draftRev ?? 0);
      report();
    },
    [queue, report],
  );

  const reload = useCallback(
    async (tabId?: string) => {
      const item = await api.item(id, tabId ?? tabRef.current);
      if (item.body.type === 'table') adopt(item.body.table);
    },
    [adopt, api, id],
  );
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const saveVersion = useCallback(async (): Promise<boolean> => {
    // In the queue's chain: the working doc goes to the draft first (the
    // save publishes the brain's draft workbook), then the save itself.
    const res = await queue.commit(async (snapshot, rev, base) => {
      const drafted =
        JSON.stringify(snapshot) === JSON.stringify(base)
          ? { rev }
          : await sendDraft(snapshot, rev, base);
      const saved = await api.save(id, {});
      if (saved.body.type !== 'table') return drafted;
      const t = saved.body.table;
      // The version is saved; the grid keeps what is on screen (typing that
      // landed during the save stays and is autosaved next).
      setTable(t);
      committedKeyRef.current = JSON.stringify(ensureTableDoc(t.data));
      return { rev: t.draftRev ?? drafted.rev };
    });
    if (!res.ok) {
      // A refusal already said its piece through the queue's state.
      const text = versionFailureText(res.failure);
      if (text) toast.error(text);
      return false;
    }
    hasDraftRef.current = false;
    report();
    onSaved();
    toast.success('Version saved.');
    return true;
    // sendDraft reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id, onSaved, queue, report, toast]);

  useEffect(() => {
    handleRef.current = { flush: () => queue.flush(), saveVersion };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, queue, saveVersion]);

  useEffect(() => {
    report();
  }, [report]);

  const onGridChange = (next: TableDoc) => {
    setDoc(next);
    docRef.current = next;
    report();
    queue.changed();
  };

  const switchTab = async (tabId: string) => {
    if (tabId === tabRef.current || switching) return;
    setSwitching(true);
    try {
      if (await queue.flush()) await reload(tabId);
    } catch {
      toast.error('Could not open that tab.');
    } finally {
      setSwitching(false);
    }
  };

  const tabs = table.tabs ?? [];
  return (
    <div className="space-y-2">
      {tabs.length > 1 ? (
        <div role="tablist" aria-label="Tabs" className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={t.id === table.tabId ? 'secondary' : 'ghost'}
              role="tab"
              aria-selected={t.id === table.tabId}
              disabled={switching}
              onClick={() => void switchTab(t.id)}
            >
              {t.name}
            </Button>
          ))}
        </div>
      ) : null}
      {clipped ? (
        <>
          <p className="text-xs text-muted-foreground">
            This table is too big to edit here. This is the first part of it.
          </p>
          <TablePresenter
            view={{ title: '', icon: null, tabs: null, legacyDoc: doc }}
            token=""
            chrome="embedded"
          />
        </>
      ) : (
        <TableGrid doc={doc} onChange={onGridChange} />
      )}
    </div>
  );
}
