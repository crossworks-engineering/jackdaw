/**
 * Wire types the brain has and the pinned contract does not yet (client
 * logins C2b, email sign-in codes). EXACT copies of @crossworks/client-types
 * (dto/client.ts): this app pins @crossworks/client-types@0.232.322, which
 * predates them.
 *
 * Temporary. Once the pin moves past the release that carries them, delete
 * this file and import each type from '@mantle/client-types' instead (every
 * import of '@/lib/contract-next' becomes one of '@mantle/client-types').
 * Keep it to copies: nothing here may differ from the brain's own definition.
 */

// ── dto/client.ts: email sign-in codes (C2b) ────────────────────────────────

/** GET /api/auth/client-code: whether this brain sends sign-in codes (an
 *  admin chose a sign-in sender). Says nothing about any email. */
export type ClientCodeAvailability = { enabled: boolean };

/** POST /api/auth/client-code { email } -> always 200 { ok: true } and a
 *  fresh request cookie, whatever the email: the answer never tells whether
 *  it is a client. When it is an active client login, a code is mailed
 *  shortly after (8 digits, 10 minutes, one use, 5 tries, this browser). */
export type ClientCodeRequested = { ok: true };

/** POST /api/auth/client-code/verify { email, code } -> 200 { ok: true } and
 *  the session cookie (30 days), or one uniform 401 for every failure (a
 *  forwarded code without this browser's request cookie among them); 429
 *  when rate limited. */
export type ClientCodeSignIn = { ok: true };

/** An email account the brain can send sign-in codes from. */
export type ClientSigninSenderCandidate = { id: string; address: string };

/** GET /api/team-admin/clients/signin-sender, and the answer to PUT
 *  { accountId: string | null }. Codes are off while `sender` is null. When
 *  a sender is chosen, its sent-mail folders are left out of mail sync
 *  (`sentFoldersExcluded`), and every code mail carries a marker the sync
 *  skips anywhere, so a live code never enters the brain. `capReached`: the
 *  brain sent `dailyCap` codes in the last 24 hours; requests still answer
 *  200, but nothing is sent until the window moves on. */
export type ClientSigninSender = {
  sender: ClientSigninSenderCandidate | null;
  candidates: ClientSigninSenderCandidate[];
  sentFoldersExcluded: string[];
  dailyCap: number;
  sentLast24h: number;
  capReached: boolean;
};

/** Why an admin's sender choice was refused (the 4xx `reason`). */
export type ClientSenderRefusedReason = 'account-not-found' | 'account-cannot-send';
