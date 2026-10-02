import { apiUrl } from '@mantle/web-ui/api-fetch';
import { canHoldClientLogins } from '@mantle/web-ui/session-registry';
import {
  CLIENT_CODE_PATH,
  CLIENT_CODE_VERIFY_PATH,
  clientCodeRequestOutcome,
  clientCodesEnabled,
  clientCodeVerifyOutcome,
  normalizeClientCode,
} from './client-code';

/**
 * A CLIENT login added on the desktop app, as one of the logins it holds.
 *
 * A client has no password. The brain's way to give one a bearer is its
 * DEVICE sign-in by emailed code (docs/mobile-companion-backend.md, "Three
 * roles on the phone"): POST /api/auth/client-code `{ email, device: true }`
 * answers a `requestId`, and POST /api/auth/client-code/verify `{ email, code,
 * requestId, deviceName }` trades the code for a 30-day bearer. The brain
 * refuses both to a web page (403 `device-only` on `Origin` or `Sec-Fetch-*`),
 * so this only works inside the desktop shell, which talks to its brain as a
 * native client (brain-fence.ts drops those headers). A browser keeps its
 * clients cookie-only; it never offers this (`clientLoginAddable`).
 *
 * The admin-issued sign-in LINK is not offered here: the brain redeems a link
 * into a session cookie only (POST /api/auth/client-link), never a bearer.
 */

/** The label the brain lists this device under (Settings > Logins > Devices). */
export const DESKTOP_CLIENT_DEVICE_NAME = 'Jackdaw desktop';

/** What a browser shows when it reaches device mode anyway. */
export const DEVICE_ONLY_MESSAGE = 'A client login can be added in the Jackdaw desktop app only.';

/** No cookie either way: device mode neither sets nor reads one. */
function post(path: string, body: unknown): Promise<Response> {
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
  });
}

function deviceOnly(status: number, body: unknown): boolean {
  return (
    status === 403 &&
    !!body &&
    typeof body === 'object' &&
    (body as { reason?: unknown }).reason === 'device-only'
  );
}

/**
 * Can this window add a client login: the desktop shell with per-login slots,
 * and a brain that sends client codes. Asked from the window itself, not the
 * server render: the desktop's UI server renders every brain's /login with
 * the first brain's environment.
 */
export async function clientLoginAddable(): Promise<boolean> {
  if (!canHoldClientLogins()) return false;
  try {
    const res = await fetch(apiUrl(CLIENT_CODE_PATH), { credentials: 'omit', cache: 'no-store' });
    return clientCodesEnabled(res.status, await res.json().catch(() => null));
  } catch {
    return false;
  }
}

export type DeviceCodeAsked =
  { kind: 'sent'; requestId: string } | { kind: 'error'; message: string };

/** Ask for a code. Again with the `requestId` held: the code already mailed
 *  keeps working and no second mail goes out while it is open. */
export async function askDeviceCode(email: string, requestId?: string): Promise<DeviceCodeAsked> {
  const res = await post(CLIENT_CODE_PATH, {
    email: email.trim(),
    device: true,
    ...(requestId ? { requestId } : {}),
  });
  const body = (await res.json().catch(() => null)) as { requestId?: unknown } | null;
  if (deviceOnly(res.status, body)) return { kind: 'error', message: DEVICE_ONLY_MESSAGE };
  const outcome = clientCodeRequestOutcome(res.status);
  if (outcome.kind !== 'sent') return outcome;
  const id = typeof body?.requestId === 'string' ? body.requestId : '';
  // A 2xx without one is not a brain that speaks device mode.
  return id ? { kind: 'sent', requestId: id } : { kind: 'error', message: DEVICE_ONLY_MESSAGE };
}

export type DeviceCodeVerified =
  | { kind: 'ok'; token: string; loginId: string | null }
  | { kind: 'not-valid'; message: string }
  | { kind: 'error'; message: string };

/** Trade the code for the client login's bearer. */
export async function verifyDeviceCode(input: {
  email: string;
  code: string;
  requestId: string;
}): Promise<DeviceCodeVerified> {
  const res = await post(CLIENT_CODE_VERIFY_PATH, {
    email: input.email.trim(),
    code: normalizeClientCode(input.code),
    requestId: input.requestId,
    deviceName: DESKTOP_CLIENT_DEVICE_NAME,
  });
  const body = (await res.json().catch(() => null)) as {
    token?: unknown;
    role?: unknown;
    loginId?: unknown;
  } | null;
  if (deviceOnly(res.status, body)) return { kind: 'error', message: DEVICE_ONLY_MESSAGE };
  const outcome = clientCodeVerifyOutcome(res.status, body);
  if (outcome.kind !== 'ok') return outcome;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  // An ok with no bearer, or one for another role, is not a client device
  // sign-in: nothing is stored.
  if (!token || body?.role !== 'client') {
    return { kind: 'error', message: 'Could not sign you in. Try again.' };
  }
  return { kind: 'ok', token, loginId: typeof body.loginId === 'string' ? body.loginId : null };
}
