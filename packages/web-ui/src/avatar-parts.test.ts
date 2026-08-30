import { describe, expect, it } from 'vitest';
import { loadAvatarStyle } from './avatar';
import {
  avatarPartsOf,
  listAvatarParts,
  renderAvatarPartsSvgSync,
  sanitizeAvatarParts,
} from './avatar-parts';

/**
 * The TEMPORARY local parts renderer (see avatar-parts.ts) — these prove the
 * builder's whole contract without a browser: parts are listed off the real
 * style declaration, pins are deterministic and visible, junk is dropped, and
 * hiding an optional component actually changes the drawing. When the
 * @crossworks/share-ui pin ships native parts and the local renderer is
 * deleted, these tests move onto the pass-through with the same assertions.
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
    const a1 = renderAvatarPartsSvgSync({ ...base, parts: { [row.name]: row.variants[0]! } });
    const a2 = renderAvatarPartsSvgSync({ ...base, parts: { [row.name]: row.variants[0]! } });
    const b = renderAvatarPartsSvgSync({ ...base, parts: { [row.name]: row.variants[1]! } });
    expect(a1).toBeTruthy();
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it('null hides an optional component; a pin force-shows it', async () => {
    const loaded = await loadAvatarStyle('adventurer');
    const row = listAvatarParts(loaded).find((r) => r.optional);
    if (!row) throw new Error('adventurer lost its optional components');
    const base = { style: 'adventurer', seed: 'Remy', size: 40 };
    const shown = renderAvatarPartsSvgSync({ ...base, parts: { [row.name]: row.variants[0]! } });
    const hidden = renderAvatarPartsSvgSync({ ...base, parts: { [row.name]: null } });
    expect(shown).not.toBe(hidden);
  });

  it('sanitize drops junk and collapses empty to undefined', async () => {
    const loaded = await loadAvatarStyle('adventurer');
    const row = listAvatarParts(loaded)[0]!;
    expect(
      sanitizeAvatarParts(loaded, {
        noSuchComponent: 'x',
        [row.name]: 'noSuchVariant',
      }),
    ).toBeUndefined();
    expect(sanitizeAvatarParts(loaded, { [row.name]: row.variants[0]! })).toEqual({
      [row.name]: row.variants[0]!,
    });
    // Junk parts render identically to no parts at all — never an error.
    const base = { style: 'adventurer', seed: 'Remy', size: 40, ramp: RAMP };
    expect(renderAvatarPartsSvgSync({ ...base, parts: { noSuchComponent: 'x' } })).toBe(
      renderAvatarPartsSvgSync(base),
    );
  });

  it('avatarPartsOf reads the wire field and collapses empty', () => {
    expect(avatarPartsOf(null)).toBeUndefined();
    expect(avatarPartsOf({ seed: 'x' })).toBeUndefined();
    expect(avatarPartsOf({ seed: 'x', parts: {} } as { seed: string })).toBeUndefined();
    expect(avatarPartsOf({ seed: 'x', parts: { hair: 'long01' } } as { seed: string })).toEqual({
      hair: 'long01',
    });
  });
});
