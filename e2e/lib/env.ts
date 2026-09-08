/**
 * E2E environment — one place that decides which stack the suite drives.
 *
 * SERVER = the API/backend origin (canonical domain in prod terms).
 * CLIENT = the owner-UI origin. Same value ⇒ same-origin topology (today's
 * monolith); different values ⇒ the split topology (client at app.<domain>).
 *
 * There is no useful default for SERVER any more: the hermetic stack this used
 * to assume left with the server workspace, so a brain is something the caller
 * names. `run-local.sh` refuses to start without one and sets both variables
 * itself; the :3900 fallback below is only for driving a local monolith by
 * hand.
 */
export const SERVER_URL = (process.env.E2E_SERVER_URL ?? 'http://localhost:3900').replace(
  /\/+$/,
  '',
);
export const CLIENT_URL = (process.env.E2E_CLIENT_URL ?? SERVER_URL).replace(/\/+$/, '');

export const OWNER_EMAIL = process.env.E2E_EMAIL ?? 'e2e-owner@example.com';
export const OWNER_PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-owner-password-1';

/** Set E2E_SKIP_PDF=1 on stacks without the browserless sidecar. */
export const SKIP_PDF = process.env.E2E_SKIP_PDF === '1';

export const ARTIFACTS_DIR = new URL('../.artifacts/', import.meta.url).pathname;
export const STORAGE_STATE_PATH = `${ARTIFACTS_DIR}owner-state.json`;
export const BEARER_PATH = `${ARTIFACTS_DIR}owner-bearer.json`;
