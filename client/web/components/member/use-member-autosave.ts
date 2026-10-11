'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@mantle/web-ui/ui/toast';
import { useFlushOnLeave } from '@mantle/web-ui/use-flush-on-leave';
import {
  createAutosaveQueue,
  leaveNeedsWarning,
  trackMemberSaves,
  type AutosaveQueue,
  type AutosaveSend,
  type AutosaveState,
  type SaveFailure,
} from '@/lib/member-autosave';

/**
 * A member editor's autosave (member logins, Phase 2): the shared queue in
 * lib/member-autosave.ts, bound to one mounted editor.
 *
 *  - Flushes on every way out (unmount, a hidden or closed tab, pagehide, an
 *    expired session) through the same useFlushOnLeave the owner editors use,
 *    so typing and leaving inside the debounce window is not lost.
 *  - Registers the queue under the item id, so reopening the item waits for
 *    that leave flush before reading it back.
 *  - Says a failure once, as a toast, when the state first turns to it. The
 *    editor also gets every state for its inline line.
 *  - Asks before the tab closes or reloads while it holds typing it could
 *    not save (leaveNeedsWarning): the member's chance to copy it out.
 *
 * `send` is read through a ref, so a new closure each render is fine.
 */
export function useMemberAutosave<T>({
  id,
  read,
  saved,
  rev,
  send,
  debounceMs,
  maxWaitMs,
  keyOf,
  onState,
  onFailure,
  onSaved,
  adoptConflicts,
}: {
  id: string;
  read: () => T;
  saved: T;
  rev: number;
  send: AutosaveSend<T>;
  debounceMs: number;
  maxWaitMs?: number;
  keyOf?: (doc: T) => string;
  onState?: (state: AutosaveState) => void;
  onFailure?: (failure: SaveFailure) => void;
  onSaved?: () => void;
  adoptConflicts?: boolean;
}): AutosaveQueue<T> {
  const toast = useToast();
  const latest = useRef({ read, send, keyOf, onState, onFailure, onSaved, toast });
  latest.current = { read, send, keyOf, onState, onFailure, onSaved, toast };

  // State callbacks stop at unmount (set again on mount: strict mode runs the
  // effect twice). A toast still shows: a leave flush the brain refused is
  // exactly what the member needs to hear about after they left.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const queueRef = useRef<AutosaveQueue<T> | null>(null);
  if (!queueRef.current) {
    let prev: AutosaveState['status'] = 'saved';
    queueRef.current = createAutosaveQueue<T>({
      read: () => latest.current.read(),
      saved,
      rev,
      send: (doc, r, base) => latest.current.send(doc, r, base),
      debounceMs,
      maxWaitMs,
      key: keyOf ? (doc) => (latest.current.keyOf ?? keyOf)(doc) : undefined,
      onState: (s) => {
        if (s.status !== prev && (s.status === 'stopped' || s.status === 'failed')) {
          latest.current.toast.error(s.message);
        }
        prev = s.status;
        if (mounted.current) latest.current.onState?.(s);
      },
      onFailure: (f) => latest.current.onFailure?.(f),
      onSaved: () => latest.current.onSaved?.(),
      adoptConflicts,
    });
    trackMemberSaves(id, queueRef.current as AutosaveQueue<unknown>);
  }
  const queue = queueRef.current;

  useFlushOnLeave(() => void queue.flush());

  // The browser's own "Leave site?" prompt; it shows no text of ours.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leaveNeedsWarning(queue.state(), queue.isDirty())) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [queue]);

  return queue;
}
