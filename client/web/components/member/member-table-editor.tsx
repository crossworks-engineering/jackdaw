'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { useFlushOnLeave } from '@mantle/web-ui/use-flush-on-leave';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import {
  diffTableDocs,
  ensureTableDoc,
  type TableDetail,
  type TableDoc,
} from '@mantle/content-core/table-model';
import { TableGrid } from '@/components/table-grid/table-grid';
import { memberSpace } from '@/lib/member-space';
import type { MemberEditorProps } from './member-editor';
import { spaceErrorMessage } from './space-status';

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
}: MemberEditorProps & { table: TableDetail }) {
  const toast = useToast();
  const [table, setTable] = useState(initial);
  const [doc, setDoc] = useState<TableDoc>(() => ensureTableDoc(initial.draft ?? initial.data));
  const [switching, setSwitching] = useState(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const savedDocRef = useRef<TableDoc>(ensureTableDoc(initial.draft ?? initial.data));
  const savedKeyRef = useRef(JSON.stringify(savedDocRef.current));
  const committedKeyRef = useRef(JSON.stringify(ensureTableDoc(initial.data)));
  const draftRevRef = useRef(initial.draftRev ?? 0);
  const hasDraftRef = useRef(initial.draft != null);
  const tabRef = useRef(initial.tabId);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const clipped = table.docClipped === true;
  const fileBacked = table.tabs !== undefined;

  const report = useCallback(() => {
    onUnsavedChange(
      hasDraftRef.current || JSON.stringify(docRef.current) !== committedKeyRef.current,
    );
  }, [onUnsavedChange]);

  /** Take the brain's copy of a tab as the new base. */
  const adopt = useCallback(
    (t: TableDetail) => {
      const fresh = ensureTableDoc(t.draft ?? t.data);
      setTable(t);
      setDoc(fresh);
      docRef.current = fresh;
      savedDocRef.current = fresh;
      savedKeyRef.current = JSON.stringify(fresh);
      committedKeyRef.current = JSON.stringify(ensureTableDoc(t.data));
      draftRevRef.current = t.draftRev ?? 0;
      hasDraftRef.current = t.draft != null;
      tabRef.current = t.tabId;
      report();
    },
    [report],
  );

  const reload = useCallback(
    async (tabId?: string) => {
      const item = await memberSpace.get('mine', id, tabId ?? tabRef.current);
      if (item.body.type === 'table') adopt(item.body.table);
    },
    [adopt, id],
  );

  const runDraft = useCallback(async (): Promise<boolean> => {
    if (clipped) return true;
    const snapshot = docRef.current;
    const key = JSON.stringify(snapshot);
    if (key === savedKeyRef.current) return true;
    try {
      const ops = fileBacked ? diffTableDocs(savedDocRef.current, snapshot) : null;
      if (ops !== null) {
        if (ops.length > 0) {
          const tabId = tabRef.current;
          const res = await memberSpace.draft(id, {
            ops: tabId ? ops.map((o) => ({ ...o, tabId })) : ops,
            if_rev: draftRevRef.current,
          });
          draftRevRef.current = res.draft_rev;
        }
      } else {
        // Not expressible as ops (a reorder). A whole document would drop
        // the other tabs of a multi-tab workbook.
        if ((table.tabs?.length ?? 1) > 1) {
          toast.error('Reordering is not supported on a table with several tabs yet.');
          return false;
        }
        const res = await memberSpace.draft(id, {
          table: snapshot as unknown as Record<string, unknown>,
          if_rev: draftRevRef.current,
        });
        draftRevRef.current = res.draft_rev;
      }
      savedDocRef.current = snapshot;
      savedKeyRef.current = key;
      hasDraftRef.current = true;
      report();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      const reason = (err as ApiError).body as { reason?: string } | undefined;
      if (
        err instanceof ApiError &&
        (err.status === 400 || (err.status === 409 && !reason?.reason))
      ) {
        // A stale etag or a refused op would wedge every later save: take
        // the brain's copy as the base again.
        toast.error(
          err.status === 409
            ? 'This table changed elsewhere. Reloaded the latest copy.'
            : `That change could not be saved: ${err.message}. Reloaded the latest copy.`,
        );
        void reload().catch(() => undefined);
        return false;
      }
      toast.error(spaceErrorMessage(err, 'Could not autosave. Check your connection.'));
      return false;
    }
  }, [clipped, fileBacked, id, reload, report, table.tabs?.length, toast]);

  // Saves are serialized: two overlapping diffs from one base would 409.
  const flush = useCallback((): Promise<boolean> => {
    const p = chain.current.then(runDraft, runDraft);
    chain.current = p;
    return p;
  }, [runDraft]);

  const saveVersion = useCallback(async (): Promise<boolean> => {
    if (!(await flush())) return false;
    try {
      const saved = await memberSpace.save(id, {});
      if (saved.body.type === 'table') adopt(saved.body.table);
      onSaved();
      toast.success('Version saved.');
      return true;
    } catch (err) {
      toast.error(spaceErrorMessage(err, 'Could not save the version.'));
      return false;
    }
  }, [adopt, flush, id, onSaved, toast]);

  useEffect(() => {
    handleRef.current = { flush, saveVersion };
    return () => {
      handleRef.current = null;
    };
  }, [flush, saveVersion, handleRef]);

  useEffect(() => {
    report();
    if (clipped || JSON.stringify(doc) === savedKeyRef.current) return;
    const h = setTimeout(() => void flush(), DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [clipped, doc, flush, report]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useFlushOnLeave(() => void flushRef.current());

  const switchTab = async (tabId: string) => {
    if (tabId === tabRef.current || switching) return;
    setSwitching(true);
    try {
      if (await flush()) await reload(tabId);
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
        <TableGrid doc={doc} onChange={setDoc} />
      )}
    </div>
  );
}
