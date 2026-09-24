'use client';

/**
 * Run buttons for a maintenance task that needs values only the owner can
 * give (its `args`): the agent a dry run works on, the review page an apply
 * reads. Preview and Apply each open a dialog that asks for the values that
 * run needs and states what it spends; the server checks every value again
 * (planRun) before it becomes a script flag.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@mantle/web-ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@mantle/web-ui/ui/dialog';
import { Field, FieldLabel } from '@mantle/web-ui/ui/field';
import { Input } from '@mantle/web-ui/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type {
  MaintenanceArg,
  MaintenanceTaskInfo,
  StartRunRequest,
} from '@mantle/web-ui/types/maintenance';

type AgentOption = { slug: string; name: string };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const isPaid = (cost: MaintenanceTaskInfo['cost'] | undefined) =>
  cost === 'llm' || cost === 'embedding';

/** The review page id the last dry run of this task printed, if any: the
 *  scripts end with "review page: <id>", so Apply can start from it. */
export function lastReviewPageId(lines: string[] | undefined): string {
  for (const line of [...(lines ?? [])].reverse()) {
    if (/review page/i.test(line)) {
      const m = UUID.exec(line);
      if (m) return m[0];
    }
  }
  return '';
}

export function ArgsRunButtons({
  task,
  busy,
  lastLines,
  onStart,
}: {
  task: MaintenanceTaskInfo;
  busy: boolean;
  /** Output of the last run of THIS task, to pre-fill the review page. */
  lastLines?: string[];
  onStart: (req: Omit<StartRunRequest, 'slug'>) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ArgsDialog task={task} busy={busy} live={false} onStart={onStart} />
      <ArgsDialog
        task={task}
        busy={busy}
        live
        initialPage={lastReviewPageId(lastLines)}
        onStart={onStart}
      />
    </div>
  );
}

function ArgsDialog({
  task,
  busy,
  live,
  initialPage = '',
  onStart,
}: {
  task: MaintenanceTaskInfo;
  busy: boolean;
  live: boolean;
  initialPage?: string;
  onStart: (req: Omit<StartRunRequest, 'slug'>) => void;
}) {
  const [open, setOpen] = useState(false);
  const needed = (task.args ?? []).filter((a) => a.for === (live ? 'apply' : 'dry'));
  const [values, setValues] = useState<Record<string, string>>({});
  const cost = live ? task.cost : task.dryRunCost;
  const spend = isPaid(cost);
  const label = live ? 'Apply' : 'Preview';

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Start each opening from the latest review page the output printed.
    if (next) setValues(initialPage ? { page: initialPage } : {});
  };
  const missing = needed.some((a) => !(values[a.name] ?? '').trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={live ? (spend ? 'destructive' : 'default') : 'outline'}
          disabled={busy}
        >
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {label} “{task.title}”
          </DialogTitle>
          <DialogDescription>
            {live
              ? 'Applies the plan on a review page that a preview wrote. Read the page first.'
              : 'Writes the plan to a new review page. Nothing else changes.'}
            {spend ? ` This run spends real ${cost} calls.` : ''}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (missing) return;
            setOpen(false);
            const args = Object.fromEntries(
              needed.map((a) => [a.name, (values[a.name] ?? '').trim()]),
            );
            onStart({ apply: live, args, ...(spend ? { confirmSpend: true } : {}) });
          }}
        >
          {needed.map((a) => (
            <ArgField
              key={a.name}
              taskSlug={task.slug}
              arg={a}
              value={values[a.name] ?? ''}
              onChange={(v) => setValues((prev) => ({ ...prev, [a.name]: v }))}
            />
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={live && spend ? 'destructive' : 'default'}
              disabled={missing}
            >
              {label} {task.slug}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ArgField({
  taskSlug,
  arg,
  value,
  onChange,
}: {
  taskSlug: string;
  arg: MaintenanceArg;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `${taskSlug}-${arg.name}`;
  if (arg.kind === 'agent')
    return <AgentField id={id} label={arg.label} value={value} onChange={onChange} />;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{arg.label} id</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="The page id the preview printed"
        autoComplete="off"
        spellCheck={false}
      />
    </Field>
  );
}

function AgentField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiFetch<{ agents: AgentOption[] }>('/api/agents').then((r) => r.agents),
  });
  const agents = useMemo(
    () => [...(agentsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [agentsQuery.data],
  );
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={agentsQuery.isPending}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={agentsQuery.isPending ? 'Loading agents…' : 'Pick an agent'} />
        </SelectTrigger>
        <SelectContent>
          {agents.map((a) => (
            <SelectItem key={a.slug} value={a.slug}>
              {a.name} <span className="text-muted-foreground">/ {a.slug}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
