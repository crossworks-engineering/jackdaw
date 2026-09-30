'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccessLevel } from '@mantle/client-types';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Input } from '@mantle/web-ui/ui/input';
import { TagInput } from '@/components/tag-input';
import { MarkdownEditor } from '@/components/markdown-editor';
import { useToast } from '@mantle/web-ui/ui/toast';
import { KeepPrivateField } from '@/components/member/keep-private-field';
import { createPrivateItem } from '@/lib/admin-private';

export type NoteRow = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  /** Access level; absent from brains older than the level rows. */
  audience?: AccessLevel;
  /** The share it inherits from a folder above it (team or client), or
   *  null. It is read at the more open of this and `audience`. Absent from
   *  brains before folder sharing reported it. */
  inherited?: 'team' | 'client' | null;
};

/**
 * Full-bleed note editor — fills the height + width of its pane (no boxed
 * `max-w-3xl` frame, no fixed editor height). Handles both create (`note=null`
 * → POST) and edit (PATCH). ⌘/Ctrl+S saves, Esc cancels. Reports `dirty` up so
 * the host can guard against discarding unsaved changes when switching notes.
 * A new note can be kept private (member logins Phase 7): it then goes into
 * this admin's own private space instead of the brain, and opens there.
 */
export function NoteEditor({
  note,
  focus,
  onToggleFocus,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  note: NoteRow | null;
  focus: boolean;
  onToggleFocus: () => void;
  onSaved: (saved: NoteRow) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const creating = note === null;
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [keepPrivate, setKeepPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Re-seed when the target note changes (e.g. switching which note is edited).
  useEffect(() => {
    setTitle(note?.title ?? '');
    setContent(note?.content ?? '');
    setTags(note?.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed only on identity switch; keying on the fields would clobber in-progress edits when the parent re-passes the same note
  }, [note?.id]);

  const dirty = creating
    ? title.trim() !== '' || content.trim() !== '' || tags.length > 0
    : title !== (note?.title ?? '') ||
      content !== (note?.content ?? '') ||
      tags.join('\0') !== (note?.tags ?? []).join('\0');

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function save() {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      if (creating && keepPrivate) {
        let href: string;
        try {
          href = await createPrivateItem('note', { title, content });
          // The private note lists in this screen now: refresh the list too.
          void queryClient.invalidateQueries({ queryKey: ['notes'] });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Save failed');
          return;
        }
        toast.success('Private note created');
        // Nothing unsaved is left here: the note is in the private space.
        onDirtyChange?.(false);
        router.push(href);
        return;
      }
      const res = await fetch(creating ? '/api/notes' : `/api/notes/${note!.id}`, {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content, tags }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? `Save failed (${res.status})`);
        return;
      }
      const { note: saved } = (await res.json()) as { note: NoteRow };
      toast.success(creating ? 'Note created' : 'Saved');
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  // ⌘/Ctrl+S save · Esc cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, tags, creating, keepPrivate]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/60 px-4 py-2 backdrop-blur">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled note"
          autoFocus
          aria-label="Note title"
          className="h-9 flex-1 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onToggleFocus}
          aria-label={focus ? 'Exit focus mode' : 'Focus mode'}
          title={focus ? 'Exit focus mode' : 'Focus mode (full width)'}
        >
          {focus ? <Minimize2 /> : <Maximize2 />}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X /> Cancel
        </Button>
        <SubmitButton pending={saving} size="sm">
          {creating ? 'Create note' : 'Save note'}
        </SubmitButton>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
        {creating ? (
          <KeepPrivateField checked={keepPrivate} onCheckedChange={setKeepPrivate} />
        ) : null}
        {/* A private note carries no tags until it is in the brain. */}
        {creating && keepPrivate ? null : (
          <TagInput value={tags} onChange={setTags} placeholder="Add tags — comma or Enter…" />
        )}
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Write in markdown…"
          className="min-h-0 flex-1"
          // Fill the pane at md+ (bounded height); fall back to a usable min
          // height on mobile where the column stacks and height is unbounded.
          height="flex-1 min-h-[24rem] md:min-h-0"
        />
      </div>
    </form>
  );
}
