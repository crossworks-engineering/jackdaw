'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import { useAvatarStyle } from '@mantle/web-ui/avatar-style-provider';
import { loadAvatarStyle, loadedAvatarStyle, randomAvatarSeed } from '@mantle/web-ui/avatar';
import {
  listAvatarParts,
  type AvatarPartInfo,
  type AvatarParts,
} from '@mantle/web-ui/avatar-parts';
import { GeneratedAvatar } from '@mantle/web-ui/generated-avatar';

/** What the builder edits and hands back: the seed plus any pinned parts. */
export type AvatarBuild = { seed: string; parts?: AvatarParts };

/** `longHair` → "Long hair" — DiceBear component keys are camelCase. */
function partLabel(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `variant12` → "Variant 12"; otherwise same camelCase split as the label. */
function variantLabel(name: string): string {
  return partLabel(name.replace(/([a-zA-Z])(\d+)$/, '$1 $2'));
}

/**
 * The avatar builder — build the head up part by part, on top of a seed.
 *
 * The brain's STYLE stays where it is chosen (Settings → Appearance); what
 * this edits is one avatar within it. Each row is a component the style
 * declares: Auto means the seed keeps picking it, the arrows walk the style's
 * variants, and optional components (glasses, features…) offer None. Choices
 * are stored per component, so Randomize can keep re-rolling the seed
 * underneath while everything you pinned stays put.
 *
 * Not every style is equally buildable — some declare one component, some
 * twenty. The rows are whatever the loaded style really offers, read off its
 * declaration, so this dialog never goes stale against a style update.
 */
export function AvatarBuilderDialog({
  open,
  onOpenChange,
  value,
  fallbackSeed,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The stored build, or null when nothing is stored yet. */
  value: AvatarBuild | null;
  /** Seed to start from when nothing is stored (agent slug, user id). */
  fallbackSeed: string;
  onSave: (v: AvatarBuild) => void;
}) {
  const { avatarStyle } = useAvatarStyle();
  const [seed, setSeed] = useState('');
  const [parts, setParts] = useState<AvatarParts>({});
  const [styleReady, setStyleReady] = useState(false);

  // Re-arm the working state each time the dialog opens: the builder edits a
  // COPY and only hands it back on save, so Cancel must cost nothing.
  useEffect(() => {
    if (!open) return;
    setSeed(value?.seed || fallbackSeed || randomAvatarSeed());
    setParts(value?.parts ?? {});
  }, [open, value, fallbackSeed]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setStyleReady(Boolean(loadedAvatarStyle(avatarStyle)));
    loadAvatarStyle(avatarStyle).then(
      () => live && setStyleReady(true),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [open, avatarStyle]);

  const loaded = styleReady ? loadedAvatarStyle(avatarStyle) : null;
  const rows: AvatarPartInfo[] = useMemo(() => (loaded ? listAvatarParts(loaded) : []), [loaded]);

  // A row's EFFECTIVE choice. Stored entries the current style can't act on
  // (a variant from another style, null on a non-optional part) read as Auto:
  // the renderer ignores them, so showing them as pinned would lie. The raw
  // entry itself is kept — see save().
  const rowValue = (row: AvatarPartInfo): string | null | undefined => {
    const v = parts[row.name];
    if (v === null) return row.optional ? null : undefined;
    return v !== undefined && row.variants.includes(v) ? v : undefined;
  };

  // Only choices a visible row actually owns count as pinned; Reset clears
  // exactly those, leaving entries carried from another style untouched.
  const rowNames = useMemo(() => new Set(rows.map((r) => r.name)), [rows]);
  const pinned = rows.filter((r) => rowValue(r) !== undefined).length;
  const resetPinned = () =>
    setParts((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !rowNames.has(k))));

  // One row's choice walks Auto → each variant → (None when optional) → Auto.
  // rowValue is always one of the stops, so a stale entry steps from Auto
  // instead of from indexOf's -1.
  const step = (row: AvatarPartInfo, dir: 1 | -1) => {
    const stops: (string | null | undefined)[] = [undefined, ...row.variants];
    if (row.optional) stops.push(null);
    const current = stops.indexOf(rowValue(row));
    const next = stops[(current + dir + stops.length) % stops.length];
    setParts((p) => {
      const out = { ...p };
      if (next === undefined) delete out[row.name];
      else out[row.name] = next;
      return out;
    });
  };

  const choiceLabel = (row: AvatarPartInfo) => {
    const v = rowValue(row);
    if (v === undefined) return 'Auto';
    if (v === null) return 'None';
    return variantLabel(v);
  };

  // Store the working map VERBATIM — no sanitize. Validation is a RENDER-time
  // concern (the renderer and the server both drop what a style can't act on),
  // and stripping here has two failure modes this dialog must not have: pins
  // saved under another brain style would be deleted by an unrelated re-roll,
  // and a save before the style chunk loads (rows empty, parts untouched)
  // would wipe everything. Passing the map through makes both a no-op.
  const save = () => {
    onSave({ seed, ...(Object.keys(parts).length ? { parts } : {}) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Build your avatar</DialogTitle>
          <DialogDescription>
            Pin the parts you want; Auto lets the seed keep choosing. Randomize re-rolls only the
            unpinned parts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <GeneratedAvatar seed={seed} parts={parts} size={96} className="border bg-muted" />
          <div className="flex flex-col items-start gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSeed(randomAvatarSeed())}
            >
              <Shuffle aria-hidden /> Randomize
            </Button>
            {pinned > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={resetPinned}>
                <RotateCcw aria-hidden /> Reset {pinned} pinned part{pinned === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {styleReady
              ? 'This avatar style has no adjustable parts — Randomize is the whole game here.'
              : 'Loading the avatar style…'}
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto pr-1 scrollbar-thin">
            {rows.map((row) => (
              <li key={row.name} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{partLabel(row.name)}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {row.variants.length}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Previous ${partLabel(row.name)}`}
                    onClick={() => step(row, -1)}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setParts((p) => {
                        const out = { ...p };
                        delete out[row.name];
                        return out;
                      })
                    }
                    title="Back to Auto"
                    className={cn(
                      'h-7 w-24 px-1.5 text-xs font-normal text-muted-foreground',
                      rowValue(row) !== undefined &&
                        'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <span className="truncate">{choiceLabel(row)}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Next ${partLabel(row.name)}`}
                    onClick={() => step(row, 1)}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            Use this avatar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
