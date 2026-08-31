import type { AvatarParts, Loaded } from './avatar';

/**
 * Avatar-builder metadata helpers. RENDERING with parts is native in
 * share-ui since 0.232.82 (`RenderAvatarOptions.parts`) — the temporary local
 * renderer that used to live here is gone; `renderAvatarSvgSync` takes the
 * parts map directly.
 *
 * Semantics live on the wire types in @mantle/client-types: component name →
 * pinned variant, or `null` to hide an OPTIONAL component; entries the
 * current style can't act on are ignored at RENDER time, never stripped from
 * storage — pins made under one brain style survive a style switch.
 */
export type { AvatarParts };

export type AvatarPartInfo = {
  /** DiceBear option key — also the stored key in {@link AvatarParts}. */
  name: string;
  /** Variant names, in the style's own order. */
  variants: string[];
  /** True when the style may leave this component out (probability < 100) —
   *  only then is `null` ("hide it") a meaningful choice. */
  optional: boolean;
};

/** The buildable components of a loaded style, straight off the metadata
 *  share-ui already parses (aliases collapsed there). */
export function listAvatarParts(loaded: Loaded): AvatarPartInfo[] {
  return Object.entries(loaded.variants).map(([name, variants]) => ({
    name,
    variants,
    optional: loaded.optional.includes(name),
  }));
}

/** Read builder parts off a wire avatar record, collapsing empty to
 *  undefined so callers can gate on truthiness. */
export function avatarPartsOf(
  avatar: { seed: string; parts?: AvatarParts | null } | null | undefined,
): AvatarParts | undefined {
  const p = avatar?.parts;
  return p && Object.keys(p).length ? p : undefined;
}
