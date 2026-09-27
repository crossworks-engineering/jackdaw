'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { memberSpace } from '@/lib/member-space';
import type { MemberEditorProps } from './member-editor';
import { useMemberAutosave } from './use-member-autosave';

const AUTOSAVE_MS = 800;

/**
 * A member's own note (member logins, Phase 2). A note has no draft: its text
 * saves as it goes (PATCH), through the same queue as the other editors, so
 * Submit and leaving both wait for the last words instead of racing them. A
 * note has no separate saved version, so Save version is the flush.
 */
export function MineNoteEditor({
  id,
  content,
  handleRef,
  onUnsavedChange,
  onSaved,
  onStatus,
}: MemberEditorProps & { content: string }) {
  const [text, setText] = useState(content);
  const textRef = useRef(content);

  const queue = useMemberAutosave<string>({
    id,
    read: () => textRef.current,
    saved: content,
    rev: 0,
    send: async (next) => {
      await memberSpace.patch(id, { content: next });
      return { rev: 0 };
    },
    debounceMs: AUTOSAVE_MS,
    keyOf: (t) => t,
    onSaved,
    onState: onStatus,
  });

  useEffect(() => {
    const flush = () => queue.flush();
    handleRef.current = { flush, saveVersion: flush };
    // Nothing waits for a Save version: what is saved is what reviewers see.
    onUnsavedChange(false);
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, onUnsavedChange, queue]);

  return (
    <Textarea
      value={text}
      onChange={(e) => {
        textRef.current = e.target.value;
        setText(e.target.value);
        queue.changed();
      }}
      onBlur={() => void queue.flush()}
      rows={16}
      aria-label="Note text"
      className="font-[family-name:var(--font-prose)]"
    />
  );
}
