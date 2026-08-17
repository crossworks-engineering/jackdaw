'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { Input } from '@mantle/web-ui/ui/input';
import { cn } from '@mantle/web-ui/lib/utils';
import type { TaskTodo } from '@mantle/client-types';

/**
 * The checklist inside a task ("task breakup"). Fully controlled: every edit
 * calls `onChange` with the complete next list and the parent PATCHes
 * `{todos}` (full replace — the server assigns ids to new items).
 */
export function TaskTodos({
  todos,
  onChange,
  disabled,
}: {
  todos: TaskTodo[];
  onChange: (next: TaskTodo[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const doneCount = todos.filter((t) => t.done).length;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    // Temp id keeps React keys stable until the server row comes back.
    onChange([...todos, { id: `tmp-${Date.now()}`, text, done: false }]);
  };

  return (
    <section className="space-y-2 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Checklist</h3>
        {todos.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{todos.length} done
          </span>
        )}
      </div>

      {todos.length > 0 && (
        <ul className="space-y-1">
          {todos.map((item) => (
            <li key={item.id} className="group flex items-center gap-2">
              <Checkbox
                checked={item.done}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange(
                    todos.map((t) => (t.id === item.id ? { ...t, done: checked === true } : t)),
                  )
                }
                aria-label={item.done ? `Reopen "${item.text}"` : `Complete "${item.text}"`}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 text-sm',
                  item.done && 'text-muted-foreground line-through',
                )}
              >
                {item.text}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onChange(todos.filter((t) => t.id !== item.id))}
                aria-label={`Remove "${item.text}"`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a step…"
          className="h-9"
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={add}>
          <Plus /> Add
        </Button>
      </div>
    </section>
  );
}
