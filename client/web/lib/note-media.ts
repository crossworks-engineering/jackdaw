/**
 * The `media:` and `draw:` references in a note's markdown, resolved the way
 * Pages resolves them. Main and the agents write a stored picture as
 * `![alt](media:<file-id>)` (and a drawing as `![alt](draw:<draw-id>)`, a
 * file link as `[spec.pdf](media:<file-id>)`). Plain ReactMarkdown knows none
 * of those schemes and drops them, so a note the assistant illustrated showed
 * no pictures.
 *
 * A reference becomes the same admin byte path a page's image node carries
 * (`fileRawSrc` / `drawRawSrc`, the shared @mantle/content-core helpers), and
 * then goes through the reader's own `mapAssetPath`, the one a page in that
 * reader already uses: the member, client and review routes map it, the owner
 * keeps it. One rule for both kinds, so a note and a page cannot disagree on
 * where a picture lives.
 */
import { defaultUrlTransform } from 'react-markdown';
import {
  drawNodeId,
  drawRawSrc,
  fileRawSrc,
  mediaFileId,
} from '@mantle/content-core/markdown-refs';

/** The admin byte path a `media:` or `draw:` reference names, or null for
 *  any other href. */
export function noteRefPath(href: string): string | null {
  const s = href.trim();
  const file = mediaFileId(s);
  if (file) return fileRawSrc(file);
  const draw = drawNodeId(s);
  if (draw) return drawRawSrc(draw);
  return null;
}

/**
 * A note reader's picture and file-link resolver, from the `mapAssetPath` a
 * page in the same reader uses (none: the owner's own routes). A reference
 * maps onto the reader's byte route; any other href keeps ReactMarkdown's
 * own safety rule (a `javascript:` src is dropped), then maps too, so an
 * admin file path written by hand also reaches the reader's route. Null: no
 * picture, the reader draws the alt text.
 */
export function noteAssetPath(
  mapAssetPath?: (path: string) => string,
): (src: string) => string | null {
  const map = mapAssetPath ?? ((path: string) => path);
  return (src) => {
    const ref = noteRefPath(src);
    if (ref) return map(ref);
    const safe = defaultUrlTransform(src.trim());
    return safe ? map(safe) : null;
  };
}

/** The owner's own note reader: the brain's own byte routes. */
export const ownerNoteAssetPath = noteAssetPath();
