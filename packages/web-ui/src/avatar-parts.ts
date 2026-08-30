import { Avatar } from '@dicebear/core';
import { loadedAvatarStyle, resolveAvatarTint, type AvatarTint, type Loaded } from './avatar';

/**
 * Avatar-builder support: explicit per-component choices layered over the seed.
 *
 * TEMPORARY LOCAL RENDERER. @crossworks/share-ui gains native `parts` support
 * on RenderAvatarOptions (mantle branch feat/avatar-parts); once that pin
 * lands, `renderAvatarPartsSvgSync` here collapses into a call through
 * `renderAvatarSvgSync` and the draw logic below is deleted. Until then this
 * mirrors share-ui's draw() exactly — background from the ramp, tint groups on
 * `theme` — plus the parts overlay, sharing the SAME loaded-style cache and
 * the SAME @dicebear/core instance (one copy in the lockfile), so the two
 * renderers cannot disagree about a style.
 *
 * Semantics (matching the server): component name → pinned variant, or `null`
 * to hide an OPTIONAL component. Unknown components/variants are dropped, not
 * errors — a choice saved under one brain style must survive a style switch.
 */
export type AvatarParts = Record<string, string | null>;

export type AvatarPartInfo = {
  /** DiceBear option key — also the stored key in {@link AvatarParts}. */
  name: string;
  /** Variant names, in the style's own order. */
  variants: string[];
  /** True when the style may leave this component out (probability < 100) —
   *  only then is `null` ("hide it") a meaningful choice. */
  optional: boolean;
};

/** The buildable components of a loaded style, aliases collapsed (an alias
 *  shares its source's option key, so listing it would duplicate the row). */
export function listAvatarParts(loaded: Loaded): AvatarPartInfo[] {
  const out: AvatarPartInfo[] = [];
  for (const [name, component] of loaded.style.components()) {
    if (component.extendsName()) continue;
    const variants = [...component.variants().keys()];
    if (!variants.length) continue;
    out.push({ name, variants, optional: component.probability() < 100 });
  }
  return out;
}

/** Read builder parts off a wire avatar record. Exists because the pinned
 *  @mantle/client-types DTOs predate the `parts` field — the wire already
 *  carries it, the TYPE doesn't yet. Collapses empty to undefined. Delete the
 *  cast (not necessarily the helper) when the pin catches up. */
export function avatarPartsOf(
  avatar: { seed: string } | null | undefined,
): AvatarParts | undefined {
  const p = (avatar as { parts?: AvatarParts } | null | undefined)?.parts;
  return p && Object.keys(p).length ? p : undefined;
}

/** Drop entries the loaded style doesn't recognise; returns undefined when
 *  nothing survives (= seed only). Used before render AND before save, so what
 *  is stored is what the preview showed. */
export function sanitizeAvatarParts(
  loaded: Loaded,
  parts: AvatarParts | null | undefined,
): AvatarParts | undefined {
  if (!parts) return undefined;
  const info = new Map(listAvatarParts(loaded).map((p) => [p.name, p]));
  const out: AvatarParts = {};
  for (const [component, variant] of Object.entries(parts)) {
    const known = info.get(component);
    if (!known) continue;
    if (variant === null) {
      if (known.optional) out[component] = null;
      continue;
    }
    if (known.variants.includes(variant)) out[component] = variant;
  }
  return Object.keys(out).length ? out : undefined;
}

// Mirror of share-ui's hex guard: DiceBear rejects non-hex colours, and an
// avatar must never be the thing that throws over a theme token.
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function renderAvatarPartsSvgSync(opts: {
  style?: string | null;
  seed: string;
  parts?: AvatarParts | null;
  size?: number;
  ramp?: readonly string[];
  tint?: AvatarTint;
}): string | null {
  const loaded = loadedAvatarStyle(opts.style);
  if (!loaded) return null;
  const colors = opts.ramp?.map((c) => c.trim()).filter((c) => HEX.test(c));
  const o: Record<string, unknown> = { seed: opts.seed || 'mantle', size: opts.size ?? 40 };
  const mode = resolveAvatarTint(opts.tint);
  if (colors?.length && mode !== 'native') {
    o.backgroundColor = colors;
    if (mode === 'theme') {
      for (const g of loaded.tintGroups) o[`${g}Color`] = colors;
    }
  }
  const parts = sanitizeAvatarParts(loaded, opts.parts);
  if (parts) {
    const optional = new Set(listAvatarParts(loaded).flatMap((p) => (p.optional ? [p.name] : [])));
    for (const [component, variant] of Object.entries(parts)) {
      if (variant === null) {
        o[`${component}Probability`] = 0;
        continue;
      }
      o[`${component}Variant`] = variant;
      // A pin must actually show: probability rolls independently of variant.
      if (optional.has(component)) o[`${component}Probability`] = 100;
    }
  }
  return new Avatar(loaded.style, o).toString();
}
