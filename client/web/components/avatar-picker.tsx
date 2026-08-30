'use client';

import { useState } from 'react';
import { SlidersHorizontal, Shuffle, X } from 'lucide-react';
import { randomAvatarSeed } from '@mantle/web-ui/avatar';
import type { AvatarParts } from '@mantle/web-ui/avatar-parts';
import { GeneratedAvatar } from '@mantle/web-ui/generated-avatar';
import { AvatarBuilderDialog } from '@/components/avatar-builder';

export type AvatarValue = { seed: string; parts?: AvatarParts };

/**
 * Avatar picker — a live preview you reroll with Randomize, or take apart in
 * the builder (Customize) to pin parts one by one.
 *
 * SEED + PARTS ONLY. The style is the brain's, chosen once in Settings →
 * Appearance, and every avatar in the brain is drawn in it; what this picks is
 * the seed (what makes THIS avatar yours) plus any pinned parts from the
 * builder. Rerolling used to change the style too, which is how a brain ended
 * up showing six unrelated styles at once. Randomize keeps pinned parts:
 * they're the choices, the seed is the shuffle underneath them.
 *
 * `value` is null when no seed has been stored. What that MEANS is the host's
 * business — a user falls back to initials, an agent to a slug-seeded avatar —
 * so both the clear action's label and the EMPTY PREVIEW are props rather than
 * assumptions.
 *
 * The empty preview matters more than it looks. This used to draw a generated
 * avatar from `fallbackSeed` whenever nothing was stored, which on the profile
 * screen showed a face the app would never use: the header keys off the stored
 * seed, so it went on showing initials. You landed, saw an avatar, pressed Save,
 * and nothing happened — because there was nothing to save until you pressed
 * Randomize. A preview has to show what you would actually get.
 */
export function AvatarPicker({
  value,
  onChange,
  fallbackSeed,
  allowClear = true,
  clearLabel = 'Use initials instead',
  emptyPreview,
}: {
  value: AvatarValue | null;
  onChange: (v: AvatarValue | null) => void;
  /** Seed used when no avatar is stored — and NOT only for the preview: agents
   *  render from this too, so clearing returns them to a slug-seeded avatar
   *  rather than to nothing. */
  fallbackSeed: string;
  allowClear?: boolean;
  /** What clearing actually does, which differs by host: a user falls back to
   *  initials, an agent falls back to its slug-seeded default. Saying "use
   *  initials instead" on an agent would simply be untrue. */
  clearLabel?: string;
  /** What to draw when nothing is stored. Pass the host's REAL fallback — the
   *  profile passes its initials avatar. Omit only when `fallbackSeed` is
   *  genuinely what the host renders too (agents), so the generated preview is
   *  already the truth. */
  emptyPreview?: React.ReactNode;
}) {
  const seed = value?.seed || fallbackSeed || 'mantle';
  const [building, setBuilding] = useState(false);

  return (
    <div className="flex items-center gap-4">
      {!value && emptyPreview ? (
        emptyPreview
      ) : (
        <GeneratedAvatar seed={seed} parts={value?.parts} size={64} className="border bg-muted" />
      )}
      <div className="flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...(value ?? {}), seed: randomAvatarSeed() })}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Shuffle className="size-3.5" aria-hidden /> Randomize
          </button>
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden /> Customize…
          </button>
        </div>
        {allowClear && value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" aria-hidden /> {clearLabel}
          </button>
        )}
      </div>
      <AvatarBuilderDialog
        open={building}
        onOpenChange={setBuilding}
        value={value}
        fallbackSeed={fallbackSeed}
        onSave={(v) => onChange(v)}
      />
    </div>
  );
}
