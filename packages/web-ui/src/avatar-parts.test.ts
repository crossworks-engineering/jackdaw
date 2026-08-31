import { describe, expect, it } from 'vitest';
import { loadAvatarStyle, renderAvatarSvg } from './avatar';
import { avatarPartsOf, listAvatarParts } from './avatar-parts';

/**
 * The builder's whole contract, proven against the NATIVE share-ui renderer
 * (parts support landed in @crossworks/share-ui 0.232.82; the temporary local
 * renderer is gone): parts are listed off the real style metadata, pins are
 * deterministic and visible, junk is dropped at render — never an error —
 * and hiding an optional component actually changes the drawing.
 */

const RAMP = ['#666ed1', '#ae467f', '#ad5700', '#4b830f', '#00889b'];

describe('avatar parts', () => {
  it('lists a style’s components with variants and the optional flag', async () => {
    const loaded = await loadAvatarStyle('adventurer');
    const rows = listAvatarParts(loaded);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.variants.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.optional)).toBe(true);
  });

  it('a pinned variant is deterministic and changes the avatar', async () => {
    const loaded = await loadAvatarStyle('adventurer');
    const row = listAvatarParts(loaded).find((r) => r.variants.length >= 2);
    if (!row) throw new Error('adventurer lost its multi-variant components');
    const base = { style: 'adventurer', seed: 'Remy', size: 40 };
    const a1 = await renderAvatarSvg({ ...base, parts: { [row.name]: row.variants[0]! } });
    const a2 = await renderAvatarSvg({ ...base, parts: { [row.name]: row.variants[0]! } });
    const b = await renderAvatarSvg({ ...base, parts: { [row.name]: row.variants[1]! } });
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it('null hides an optional component; a pin force-shows it', async () => {
    const loaded = await loadAvatarStyle('adventurer');
    const row = listAvatarParts(loaded).find((r) => r.optional);
    if (!row) throw new Error('adventurer lost its optional components');
    const base = { style: 'adventurer', seed: 'Remy', size: 40 };
    const shown = await renderAvatarSvg({ ...base, parts: { [row.name]: row.variants[0]! } });
    const hidden = await renderAvatarSvg({ ...base, parts: { [row.name]: null } });
    expect(shown).not.toBe(hidden);
  });

  it('junk parts render identically to no parts at all — never an error', async () => {
    const loaded = await loadAvatarStyle('adventurer');
    const row = listAvatarParts(loaded)[0]!;
    const base = { style: 'adventurer', seed: 'Remy', size: 40, ramp: RAMP };
    const plain = await renderAvatarSvg(base);
    const junk = await renderAvatarSvg({
      ...base,
      parts: { noSuchComponent: 'x', [row.name]: 'noSuchVariant' },
    });
    expect(junk).toBe(plain);
  });

  it('avatarPartsOf reads the wire field and collapses empty', () => {
    expect(avatarPartsOf(null)).toBeUndefined();
    expect(avatarPartsOf({ seed: 'x' })).toBeUndefined();
    expect(avatarPartsOf({ seed: 'x', parts: {} })).toBeUndefined();
    expect(avatarPartsOf({ seed: 'x', parts: { hair: 'long01' } })).toEqual({ hair: 'long01' });
  });
});
