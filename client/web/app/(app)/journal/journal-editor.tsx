'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { MOODS, CATEGORIES } from '@mantle/content-core/journal-options';
import { Button } from '@mantle/web-ui/ui/button';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Input } from '@mantle/web-ui/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@mantle/web-ui/ui/field';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { DateTimePicker } from '@mantle/web-ui/ui/date-time-picker';
import { TagInput } from '@/components/tag-input';
import { useToast } from '@mantle/web-ui/ui/toast';
import type { JournalRow } from '@mantle/client-types';

// Wire shape is the GET /api/journal mapper's output — single source of truth.
// Re-exported so the list client keeps importing it from here; drift is a
// compile error.
export type { JournalRow };

// Radix Select forbids an empty-string item value, so "no selection" rides a
// sentinel that maps to '' on save (clears the field).
const NONE = '__none__';

/**
 * Journal entry editor — a small, plain-text paragraph plus mood + category.
 * No markdown editor by design: entries are short and atomic so they chunk
 * cleanly into the identity context. Handles create (`entry=null` → POST) and
 * edit (PATCH). ⌘/Ctrl+S saves, Esc cancels. Reports `dirty` up so the host
 * can guard against discarding unsaved changes.
 */
export function JournalEditor({
  entry,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  entry: JournalRow | null;
  onSaved: (saved: JournalRow) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const creating = entry === null;
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [mood, setMood] = useState(entry?.mood ?? '');
  const [category, setCategory] = useState(entry?.category ?? '');
  const [entryDate, setEntryDate] = useState<Date | null>(
    entry?.entryDate ? new Date(entry.entryDate) : null,
  );
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [saving, setSaving] = useState(false);
  /** Validation message for the body, the only required field. */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(entry?.title ?? '');
    setBody(entry?.body ?? '');
    setMood(entry?.mood ?? '');
    setCategory(entry?.category ?? '');
    setEntryDate(entry?.entryDate ? new Date(entry.entryDate) : null);
    setTags(entry?.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed only on identity switch; keying on the fields would clobber in-progress edits when the parent re-passes the same entry
  }, [entry?.id]);

  const initialDate = entry?.entryDate ? new Date(entry.entryDate).getTime() : null;
  const dirty = creating
    ? body.trim() !== '' || mood !== '' || category !== '' || tags.length > 0
    : title !== (entry?.title ?? '') ||
      body !== (entry?.body ?? '') ||
      mood !== (entry?.mood ?? '') ||
      category !== (entry?.category ?? '') ||
      (entryDate?.getTime() ?? null) !== initialDate ||
      tags.join(' ') !== (entry?.tags ?? []).join(' ');

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function save() {
    if (!body.trim()) {
      // §6b: on the field, not in a toast. A toast for a validation failure
      // announces itself once and then leaves no trace beside the empty control
      // the user has to go back and fill.
      setError('Write something first');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        body: body.trim(),
        title: title.trim() || undefined,
        mood,
        category,
        entryDate: entryDate ? entryDate.toISOString() : '',
        tags,
      };
      let saved: JournalRow;
      try {
        // `apiSend`, NOT a bare `fetch`. This was the last raw `fetch('/api/…')`
        // in the client, and on the detached topology it was broken outright:
        // the request went to the CLIENT origin, which has no /api routes at
        // all, so every journal save was redirected to /login. Everything else
        // in the app already went through apiFetch/apiSend to the brain.
        ({ journal: saved } = await apiSend<{ journal: JournalRow }>(
          creating ? '/api/journal' : `/api/journal/${entry!.id}`,
          creating ? 'POST' : 'PATCH',
          payload,
        ));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
        toast.error(e instanceof Error ? e.message : 'Save failed');
        return;
      }
      toast.success(creating ? 'Journal entry saved' : 'Saved');
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
  }, [title, body, mood, category, entryDate, tags, creating]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      {/* Sticky against the PANE's scroller now (MasterDetail owns it), not an
          inner one of its own — two nested scrollers put two bars side by side
          and made the sticky header stick to the wrong one. */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-4 py-2 backdrop-blur">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Journal entry title"
          className="h-9 flex-1 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
        />
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X /> Cancel
        </Button>
        <SubmitButton pending={saving} size="sm">
          Save journal entry
        </SubmitButton>
      </header>

      <div className="px-4 py-4">
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            {/* The body has no visible label by design — it is the whole point
                of the screen and the placeholder carries the prompt. The label
                exists for screen readers only. */}
            <FieldLabel htmlFor="journal-body" className="sr-only">
              Journal entry
            </FieldLabel>
            <Textarea
              id="journal-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="A short, honest note — who you are, what you’re doing, how you feel…"
              autoFocus
              aria-invalid={!!error || undefined}
              aria-describedby={error ? 'journal-body-error' : undefined}
              className="min-h-[10rem] resize-y text-base leading-relaxed"
            />
            <FieldError id="journal-body-error">{error}</FieldError>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="journal-mood">Mood</FieldLabel>
              <Select value={mood || NONE} onValueChange={(v) => setMood(v === NONE ? '' : v)}>
                <SelectTrigger id="journal-mood">
                  <SelectValue placeholder="How did it feel?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {MOODS.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.emoji} {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="journal-category">Area of life</FieldLabel>
              <Select
                value={category || NONE}
                onValueChange={(v) => setCategory(v === NONE ? '' : v)}
              >
                <SelectTrigger id="journal-category">
                  <SelectValue placeholder="What is this about?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="journal-date">When (optional)</FieldLabel>
            <DateTimePicker
              id="journal-date"
              value={entryDate}
              onChange={setEntryDate}
              placeholder="Defaults to now"
              clearable
            />
          </Field>

          <Field>
            <FieldLabel asChild>
              <span>Tags</span>
            </FieldLabel>
            <TagInput value={tags} onChange={setTags} placeholder="Add tags — comma or Enter…" />
          </Field>
        </FieldGroup>
      </div>
    </form>
  );
}
