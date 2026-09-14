import type { TocEntry } from '@mantle/content-core/page-toc';

/**
 * Is this outline the same as the last one?
 *
 * The page outline is rebuilt on every edit, throttled to an animation frame.
 * `buildPageToc` is pure but returns a FRESH array every call, so handing it
 * straight to `setToc` re-renders the whole page client once per frame for the
 * entire time someone is typing — even though the outline only changes when a
 * heading or a sub-page card does, which is almost never mid-sentence.
 *
 * Comparing the built result is deliberate. Guarding earlier — walking the
 * document for headings before building — would also skip the build, but the
 * build is not what costs: serialising the LARGEST page in the system measures
 * 0.1ms, and `JSON.stringify` of it 0.5ms. The re-render is the cost, so that
 * is what this skips.
 */
export function sameToc(a: readonly TocEntry[], b: readonly TocEntry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    // Unreachable with equal lengths, but the indexed reads are `T | undefined`
    // under noUncheckedIndexedAccess. Falling to "not equal" is the safe side:
    // it rebuilds the outline, it never keeps a stale one.
    if (!x || !y) return false;
    // Every field the outline renders or navigates by. `depth` is derived from
    // `level`, but it is compared too: it is what the indentation uses, and a
    // derived field that stops being checked is how a stale outline survives.
    if (
      x.id !== y.id ||
      x.kind !== y.kind ||
      x.level !== y.level ||
      x.depth !== y.depth ||
      x.label !== y.label
    ) {
      return false;
    }
  }
  return true;
}
