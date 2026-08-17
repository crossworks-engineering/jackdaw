'use client';

import { useState } from 'react';
import { Button } from '@mantle/web-ui/ui/button';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Input } from '@mantle/web-ui/ui/input';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@mantle/web-ui/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { TagInput } from '@/components/tag-input';
import { DateTimePicker } from '@mantle/web-ui/ui/date-time-picker';
import type { RecurFreq } from '@mantle/client-types';

export const REMIND_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: 'At start' },
  { value: 5, label: '5 min before' },
  { value: 15, label: '15 min before' },
  { value: 60, label: '1 hour before' },
  { value: 60 * 24, label: '1 day before' },
];

export const RECUR_PRESETS: { value: RecurFreq; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

/** Form state — datetimes as Date|null (driven by DateTimePicker), tags as string[]. */
export type EventFormValues = {
  title: string;
  body: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string;
  remindMinutesBefore: number;
  recur: RecurFreq;
  recurUntil: Date | null;
  tags: string[];
};

/** Normalized payload for the API (ISO instants, nulls for cleared fields). */
export type EventPayload = {
  title: string;
  body: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  remindMinutesBefore: number;
  recur: RecurFreq;
  recurUntil: string | null;
  tags: string[];
  timezone?: string;
};

export const emptyEventForm = (): EventFormValues => ({
  title: '',
  body: '',
  startsAt: null,
  endsAt: null,
  location: '',
  remindMinutesBefore: 0,
  recur: 'none',
  recurUntil: null,
  tags: [],
});

export function eventToForm(e: {
  title: string;
  body: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  remindMinutesBefore: number;
  recur: RecurFreq;
  recurUntil: string | null;
  tags: string[];
}): EventFormValues {
  return {
    title: e.title,
    body: e.body,
    startsAt: new Date(e.startsAt),
    endsAt: e.endsAt ? new Date(e.endsAt) : null,
    location: e.location ?? '',
    recur: e.recur,
    remindMinutesBefore: e.remindMinutesBefore,
    recurUntil: e.recurUntil ? new Date(e.recurUntil) : null,
    tags: e.tags,
  };
}

/**
 * Which control a validation failure belongs to. The form has four separate
 * ways to be wrong, and §6b's `data-invalid`/`aria-invalid`/`role="alert"`
 * triple is only worth anything if it lands on the control at fault — a single
 * message floated at the foot of the form tells a screen-reader user that
 * something is wrong but not what to go and fix.
 */
type FieldName = 'title' | 'startsAt' | 'endsAt' | 'recurUntil';
type FormError = { field: FieldName; message: string };

/**
 * Shared event editor body — used by the master-detail "create" pane and the
 * EventDetail "edit" mode. Owns its field state; the parent POSTs/PATCHes the
 * normalized payload in `onSubmit` and switches view on success.
 */
export function EventForm({
  initial,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: EventFormValues;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: EventPayload) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EventFormValues>(initial);
  const [error, setError] = useState<FormError | null>(null);

  /** Props that mark one control invalid, or nothing at all. Keeps the three
   *  attributes together so a field cannot end up red without being announced. */
  const invalid = (field: FieldName) =>
    error?.field === field
      ? { 'aria-invalid': true as const, 'aria-describedby': `event-${field}-error` }
      : {};

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError({ field: 'title', message: 'Title is required' });
    if (!form.startsAt) {
      return setError({ field: 'startsAt', message: 'Start time is required' });
    }
    if (form.endsAt && form.endsAt < form.startsAt) {
      return setError({ field: 'endsAt', message: 'End time is before the start' });
    }
    const recurring = form.recur !== 'none';
    if (recurring && form.recurUntil && form.recurUntil < form.startsAt) {
      return setError({ field: 'recurUntil', message: 'Repeat-until date is before the start' });
    }
    await onSubmit({
      title: form.title.trim(),
      body: form.body,
      startsAt: form.startsAt.toISOString(),
      endsAt: form.endsAt ? form.endsAt.toISOString() : null,
      location: form.location.trim() || null,
      remindMinutesBefore: form.remindMinutesBefore,
      recur: form.recur,
      // Only carry an end date for a repeating event; clear it otherwise.
      recurUntil: recurring && form.recurUntil ? form.recurUntil.toISOString() : null,
      tags: form.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={error?.field === 'title' || undefined}>
          <FieldLabel htmlFor="event-title">Title</FieldLabel>
          <Input
            id="event-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Dentist appointment"
            autoFocus
            {...invalid('title')}
          />
          <FieldError id="event-title-error">
            {error?.field === 'title' ? error.message : null}
          </FieldError>
        </Field>

        {/* Two controls, one row on anything wider than a phone. The grid is
            layout, so it stays a plain wrapper; each cell is still a Field. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={error?.field === 'startsAt' || undefined}>
            <FieldLabel htmlFor="event-starts">Starts</FieldLabel>
            <DateTimePicker
              id="event-starts"
              value={form.startsAt}
              onChange={(startsAt) => setForm({ ...form, startsAt })}
              placeholder="Pick a start"
              {...invalid('startsAt')}
            />
            <FieldError id="event-startsAt-error">
              {error?.field === 'startsAt' ? error.message : null}
            </FieldError>
          </Field>
          <Field data-invalid={error?.field === 'endsAt' || undefined}>
            <FieldLabel htmlFor="event-ends">Ends (optional)</FieldLabel>
            <DateTimePicker
              id="event-ends"
              value={form.endsAt}
              onChange={(endsAt) => setForm({ ...form, endsAt })}
              placeholder="Pick an end"
              clearable
              {...invalid('endsAt')}
            />
            <FieldError id="event-endsAt-error">
              {error?.field === 'endsAt' ? error.message : null}
            </FieldError>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="event-remind">Remind</FieldLabel>
            <Select
              value={String(form.remindMinutesBefore)}
              onValueChange={(v) => setForm({ ...form, remindMinutesBefore: Number(v) })}
            >
              <SelectTrigger id="event-remind" aria-describedby="event-remind-description">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMIND_PRESETS.map((r) => (
                  <SelectItem key={r.value} value={String(r.value)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Was a paragraph above the whole form. It is about this one
                control, so §6a says it belongs under it. */}
            <FieldDescription id="event-remind-description">
              Pings your most-recent Telegram chat this far before the start.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-location">Location (optional)</FieldLabel>
            <Input
              id="event-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Where?"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="event-repeat">Repeat</FieldLabel>
            <Select
              value={form.recur}
              onValueChange={(v) => setForm({ ...form, recur: v as RecurFreq })}
            >
              <SelectTrigger id="event-repeat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECUR_PRESETS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.recur !== 'none' && (
            <Field data-invalid={error?.field === 'recurUntil' || undefined}>
              <FieldLabel htmlFor="event-recur-until">Until (optional)</FieldLabel>
              <DateTimePicker
                id="event-recur-until"
                value={form.recurUntil}
                onChange={(recurUntil) => setForm({ ...form, recurUntil })}
                placeholder="Repeats forever"
                clearable
                {...invalid('recurUntil')}
              />
              <FieldError id="event-recurUntil-error">
                {error?.field === 'recurUntil' ? error.message : null}
              </FieldError>
            </Field>
          )}
        </div>

        <Field>
          {/* TagInput owns no single focusable id, so the label describes the
              group rather than pointing at a control with `htmlFor`. */}
          <FieldLabel asChild>
            <span>Tags</span>
          </FieldLabel>
          <TagInput
            value={form.tags}
            onChange={(tags) => setForm({ ...form, tags })}
            placeholder="Add tags…"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="event-body">Notes</FieldLabel>
          <Textarea
            id="event-body"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={5}
            placeholder="Anything to remember about this event."
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <SubmitButton pending={submitting}>{submitLabel}</SubmitButton>
        </div>
      </FieldGroup>
    </form>
  );
}
