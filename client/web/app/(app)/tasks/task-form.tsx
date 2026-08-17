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
import { PRIORITIES, STATUSES, STATUS_LABEL, type Priority, type Status } from './task-meta';

export type TaskFormValues = {
  title: string;
  body: string;
  status: Status;
  priority: Priority;
  due: Date | null;
  tags: string[];
};

export type TaskPayload = {
  title: string;
  body: string;
  status: Status;
  priority: Priority;
  dueAt: string | null;
  tags: string[];
};

export const emptyTaskForm = (): TaskFormValues => ({
  title: '',
  body: '',
  status: 'open',
  priority: 'normal',
  due: null,
  tags: [],
});

export function taskToForm(t: {
  title: string;
  body: string;
  status: Status;
  priority: Priority;
  dueAt: string | null;
  tags: string[];
}): TaskFormValues {
  return {
    title: t.title,
    body: t.body,
    status: t.status,
    priority: t.priority,
    due: t.dueAt ? new Date(t.dueAt) : null,
    tags: t.tags,
  };
}

/**
 * Shared task editor body — used by the master-detail "create" pane and the
 * TaskDetail "edit" mode. Owns its field state; the parent POSTs/PATCHes the
 * normalized payload in `onSubmit` and switches view on success.
 */
export function TaskForm({
  initial,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: TaskFormValues;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: TaskPayload) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TaskFormValues>(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError('Title is required');
    await onSubmit({
      title: form.title.trim(),
      body: form.body,
      status: form.status,
      priority: form.priority,
      dueAt: form.due ? form.due.toISOString() : null,
      tags: form.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="task-title">Title</FieldLabel>
          <Input
            id="task-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="What needs doing?"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'task-form-error' : undefined}
            autoFocus
          />
          {/* Anchored to the field it is about, not floated at the foot of the
              form: `role="alert"` only helps if the control it names is the one
              the user is standing on. */}
          <FieldError id="task-form-error">{error}</FieldError>
        </Field>

        {/* Two controls, one row on anything wider than a phone. The grid is
            layout, so it stays a plain wrapper; each cell is still a Field. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="task-status">Status</FieldLabel>
            <Select
              value={form.status}
              onValueChange={(status) => setForm({ ...form, status: status as Status })}
            >
              <SelectTrigger id="task-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
            <Select
              value={form.priority}
              onValueChange={(priority) => setForm({ ...form, priority: priority as Priority })}
            >
              <SelectTrigger id="task-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="task-due">Due</FieldLabel>
          <DateTimePicker
            id="task-due"
            value={form.due}
            onChange={(due) => setForm({ ...form, due })}
            placeholder="No due date"
            clearable
          />
          <FieldDescription>Optional. Overdue tasks are flagged on the list.</FieldDescription>
        </Field>

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
          <FieldDescription>Tags group the board and drive its filters.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="task-body">Notes</FieldLabel>
          <Textarea
            id="task-body"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={5}
            placeholder="Anything to remember about this task. Markdown supported."
            aria-describedby="task-body-description"
          />
          <FieldDescription id="task-body-description">
            Plain markdown (lists, links, <code>`code`</code>, **bold**) rendered on the detail
            view.
          </FieldDescription>
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
