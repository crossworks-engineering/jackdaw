/**
 * A login that is not an Admin user reads bytes from the member routes (W6b
 * contract item 2: a file's bytes and a drawing's SVG stay on
 * /api/member/files/:id and /api/member/draws/:id/svg; the owner asset routes
 * answer Admin users only). The brain serves them in the login's scope. This
 * maps the owner asset paths the screens and a stored page document carry
 * onto those routes; a thumbnail stays a thumbnail. Anything else passes
 * through unchanged. The shell sets it as the asset path map (assetUrl).
 */
const FILE_RE = /^\/api\/files\/files\/([0-9a-f-]{36})(?:\?(.*))?$/i;
const DRAW_RE = /^\/api\/draws\/([0-9a-f-]{36})\/svg(?:\?.*)?$/i;

export function memberAssetPath(path: string): string {
  const file = FILE_RE.exec(path);
  if (file) {
    const thumb = new URLSearchParams(file[2] ?? '').get('thumb') === '1';
    return `/api/member/files/${file[1]}${thumb ? '?thumb=1' : ''}`;
  }
  const draw = DRAW_RE.exec(path);
  if (draw) return `/api/member/draws/${draw[1]}/svg`;
  return path;
}

export const memberFileUrlPath = (id: string) => `/api/member/files/${encodeURIComponent(id)}`;
export const memberDrawUrlPath = (id: string) => `/api/member/draws/${encodeURIComponent(id)}/svg`;
