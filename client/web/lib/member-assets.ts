/**
 * The member surface (/m) reads bytes from its own routes: the brain serves
 * them at the member's level (row security), and refuses a member on the
 * admin byte routes. This maps the admin asset paths a stored page document
 * carries onto the member routes. Anything else passes through unchanged.
 */
const FILE_RE = /^\/api\/files\/files\/([0-9a-f-]{36})(?:\?.*)?$/i;
const DRAW_RE = /^\/api\/draws\/([0-9a-f-]{36})\/svg(?:\?.*)?$/i;

export function memberAssetPath(path: string): string {
  const file = FILE_RE.exec(path);
  if (file) return `/api/member/files/${file[1]}`;
  const draw = DRAW_RE.exec(path);
  if (draw) return `/api/member/draws/${draw[1]}/svg`;
  return path;
}

export const memberFileUrlPath = (id: string) => `/api/member/files/${id}`;
export const memberDrawUrlPath = (id: string) => `/api/member/draws/${id}/svg`;
