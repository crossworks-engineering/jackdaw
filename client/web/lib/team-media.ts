/**
 * The member surfaces' media addressing — the pure half of
 * `components/team-media.tsx`, split out because jackdaw tests `.ts` and has no
 * React renderer in the suite.
 */

/** Which member surface owns the authorization — a forum topic, or a thread. */
export type MediaSurface = 'forum' | 'messages';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a member fetches an agent-produced picture. Mirrors the two routes in
 *  mantle's `server/web/app/api/team/{forum,messages}/media/[nodeId]`. */
export function teamMediaPath(surface: MediaSurface, nodeId: string): string {
  return surface === 'forum'
    ? `/api/team/forum/media/${nodeId}`
    : `/api/team/messages/media/${nodeId}`;
}

/** Where a member fetches a DRAWING's committed snapshot. Its own route rather
 *  than the media one because that serves file bytes and refuses any non-image
 *  mime, which a draw node is not. Mirrors mantle's
 *  `server/web/app/api/team/{forum,messages}/drawing/[nodeId]`. */
export function teamDrawingPath(surface: MediaSurface, nodeId: string): string {
  return surface === 'forum'
    ? `/api/team/forum/drawing/${nodeId}`
    : `/api/team/messages/drawing/${nodeId}`;
}

/**
 * The node id in an `![alt](media:<node-id>)` src, or null for anything else.
 *
 * Validated to a uuid here rather than at the fetch: a reply is model output,
 * `media:` is a marker it can mistype, and a malformed one should read as "not
 * a media marker" — falling through to a normal `<img>` that visibly fails —
 * instead of becoming a request to a route that answers 404 for everything.
 */
export function mediaNodeId(src: string | null | undefined): string | null {
  return markerNodeId(src, 'media:');
}

/**
 * The node id in an `![alt](draw:<node-id>)` src, or null for anything else.
 *
 * A separate marker rather than a second meaning for `media:`, because the two
 * resolve through different routes and a reply cannot be trusted to know which
 * kind of node an id belongs to. `media:` on a drawing should read as a broken
 * picture, not silently become a drawing.
 */
export function drawingNodeId(src: string | null | undefined): string | null {
  return markerNodeId(src, 'draw:');
}

/**
 * Shared by both markers. The uuid is validated HERE rather than at the fetch:
 * a reply is model output, the prefix is something it can mistype, and a
 * malformed marker should read as "not a marker" — falling through to a normal
 * `<img>` that visibly fails — instead of becoming a request to a route that
 * answers 404 for everything.
 */
function markerNodeId(src: string | null | undefined, prefix: string): string | null {
  if (typeof src !== 'string') return null;
  if (!src.startsWith(prefix)) return null;
  const id = src.slice(prefix.length).trim();
  return UUID_RE.test(id) ? id : null;
}
