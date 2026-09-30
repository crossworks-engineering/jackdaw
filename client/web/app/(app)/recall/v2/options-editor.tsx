'use client';

import { Plus, X } from 'lucide-react';
import type { RecallOptionDTO } from '@mantle/web-ui/types/recall-v2';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { optionTargetValue, type OptionTarget } from '@/lib/recall-v2';

/**
 * A card's options: where an agent can go next, and when. Each one is an
 * affordance ("use when ..."), never a command. A target is another card in
 * this map, or the entry card of another published map.
 *
 * The list is the card's WHOLE option list: the brain replaces it on save.
 */
export function OptionsEditor({
  options,
  targets,
  onChange,
}: {
  options: RecallOptionDTO[];
  targets: OptionTarget[];
  onChange: (options: RecallOptionDTO[]) => void;
}) {
  function update(i: number, patch: Partial<RecallOptionDTO>) {
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  }
  function setTarget(i: number, value: string) {
    const t = targets.find((x) => x.value === value);
    const cur = options[i];
    if (!t || !cur) return;
    const next: RecallOptionDTO = {
      label: cur.label || t.label.replace(/ \(another map\)$/, ''),
      useWhen: cur.useWhen,
      targetSlug: t.targetSlug,
    };
    if (t.targetMap) next.targetMap = t.targetMap;
    onChange(options.map((o, j) => (j === i ? next : o)));
  }

  return (
    <div className="space-y-2">
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No options. An agent that opens this card has nowhere to go from it.
        </p>
      )}
      {options.map((o, i) => {
        const value = optionTargetValue(o);
        // A target the list does not offer (an unpublished map, a card since
        // deleted) still shows, so saving does not silently change it.
        const known = targets.some((t) => t.value === value);
        return (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border bg-card p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Select value={o.targetSlug ? value : undefined} onValueChange={(v) => setTarget(i, v)}>
              <SelectTrigger aria-label={`Option ${i + 1} target`} className="h-9">
                <SelectValue placeholder="Go to…" />
              </SelectTrigger>
              <SelectContent>
                {!known && o.targetSlug && (
                  <SelectItem value={value}>{o.targetMap ?? o.targetSlug} (unavailable)</SelectItem>
                )}
                {targets.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label={`Option ${i + 1} label`}
              value={o.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label"
              className="h-9"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove option ${i + 1}`}
              onClick={() => onChange(options.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
            <Input
              aria-label={`Option ${i + 1} use when`}
              value={o.useWhen}
              onChange={(e) => update(i, { useWhen: e.target.value })}
              placeholder="Use when… (optional)"
              className="h-9 sm:col-span-3"
            />
          </div>
        );
      })}
      <Button
        variant="outline"
        size="xs"
        onClick={() => onChange([...options, { label: '', useWhen: '', targetSlug: '' }])}
        disabled={targets.length === 0}
      >
        <Plus /> Option
      </Button>
    </div>
  );
}
