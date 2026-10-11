/**
 * The brain's answer to PATCH /api/peers/:id. Typed here: the route's shape is
 * not in @mantle/client-types. Binding a peer to the owner when someone else
 * made it mints a fresh inbound token: the brain answers it once, in plain
 * text, and the old token stops working. Every other change answers `{ ok }`.
 */
export type PeerPatchAnswer = { ok: true; inboundToken?: string };

/**
 * Hand a token from the PATCH answer to the one-time reveal. Returns whether
 * it did, so a caller can tell the owner. No token, no reveal.
 */
export function revealPatchToken(
  answer: PeerPatchAnswer | null | undefined,
  onRevealNew: (token: string) => void,
): boolean {
  const token = answer?.inboundToken;
  if (typeof token !== 'string' || !token) return false;
  onRevealNew(token);
  return true;
}
