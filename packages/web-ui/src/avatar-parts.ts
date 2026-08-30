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

// One component walk per Loaded style, ever: Loaded instances are long-lived
// module singletons (share-ui's STYLES cache), and the builder preview renders
// on every arrow click — without this cache each render walked the declaration
// twice (sanitize + optional set).
const PART_INFO = new WeakMap<Loaded, Map<string, AvatarPartInfo>>();

function partInfo(loaded: Loaded): Map<string, AvatarPartInfo> {
  const hit = PART_INFO.get(loaded);
  if (hit) return hit;
  const map = new Map<string, AvatarPartInfo>();
  for (const [name, component] of loaded.style.components()) {
    // Aliases share their source's option key; listing them would duplicate rows.
    if (component.extendsName()) continue;
    const variants = [...component.variants().keys()];
    if (!variants.length) continue;
    map.set(name, { name, variants, optional: component.probability() < 100 });
  }
  PART_INFO.set(loaded, map);
  return map;
}

/** The buildable components of a loaded style, aliases collapsed. */
export function listAvatarParts(loaded: Loaded): AvatarPartInfo[] {
  return [...partInfo(loaded).values()];
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
 *  nothing survives (= seed only). A RENDER-time concern only — stored parts
 *  are never stripped on save, so pins made under one brain style survive a
 *  style switch (and a switch back revives them). */
export function sanitizeAvatarParts(
  loaded: Loaded,
  parts: AvatarParts | null | undefined,
): AvatarParts | undefined {
  if (!parts) return undefined;
  const info = partInfo(loaded);
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
    const info = partInfo(loaded);
    for (const [component, variant] of Object.entries(parts)) {
      if (variant === null) {
        o[`${component}Probability`] = 0;
        continue;
      }
      o[`${component}Variant`] = variant;
      // A pin must actually show: probability rolls independently of variant.
      if (info.get(component)?.optional) o[`${component}Probability`] = 100;
    }
  }
  return new Avatar(loaded.style, o).toString();
}
