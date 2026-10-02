import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The brain's public /api/auth POSTs that set or use the session cookie
 * refuse a body not declared JSON (415) since the client logins audit fixes
 * (B15: a cross-site form can only send urlencoded, multipart or text/plain).
 * Every one this app sends says `content-type: application/json`.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** The source from `needle` to the end of the call (the next `});`). */
function callAt(src: string, needle: string): string {
  const at = src.indexOf(needle);
  expect(at, needle).toBeGreaterThanOrEqual(0);
  return src.slice(at, src.indexOf('});', at) + 3);
}

const JSON_HEADER = "headers: { 'content-type': 'application/json' }";

describe('auth POSTs declare JSON', () => {
  it.each([
    ['../app/client-signin/client-signin-client.tsx', "fetch(apiUrl('/api/auth/client-link')"],
    ['../app/login/login-form.tsx', "fetch(apiUrl('/api/auth/signup')"],
    // Sign-in is a bearer exchange in both topologies now (multi-login): the
    // form's credential POST is /api/auth/token, still declared JSON.
    ['../app/login/login-form.tsx', "fetch(apiUrl('/api/auth/token')"],
    // Same-origin over a client's cookie: the password sign-in sets this
    // login's cookie over it rather than a logout ending the client.
    ['../app/login/login-form.tsx', "fetch(apiUrl('/api/auth/login')"],
    ['../app/invite/invite-client.tsx', "fetch(apiUrl('/api/auth/invite/accept')"],
    ['../components/member/member-password-dialog.tsx', "apiUrl('/api/auth/change-password')"],
    // client-code and client-code/verify go through the form's one helper.
    ['../app/client-signin/client-code-form.tsx', 'fetch(apiUrl(path), {'],
    // Sign out everywhere posts to /api/auth/logout through its helper.
    ['./sign-out-everywhere.ts', 'fetch(\n      apiUrl(path),'],
  ])('%s: %s', (file, needle) => {
    const call = callAt(read(file), needle);
    expect(call).toContain(JSON_HEADER);
    expect(call).toMatch(/body: JSON\.stringify\(/);
  });

  it('the code form sends both code routes through that helper', () => {
    const form = read('../app/client-signin/client-code-form.tsx');
    expect(form).toContain('await post(CLIENT_CODE_PATH, {');
    expect(form).toContain('await post(CLIENT_CODE_VERIFY_PATH, {');
  });
});
