import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVERYWHERE_CONFIRM,
  everywhereConfirmText,
  everywhereOutcome,
  otherLoginEverywhereText,
  signLoginOutEverywhere,
  signOutEverywhere,
} from './sign-out-everywhere';

let calls: { method: string; url: string; body: unknown }[] = [];
let answer: { status: number; body: unknown } = { status: 200, body: { ok: true } };

beforeEach(() => {
  calls = [];
  answer = { status: 200, body: { ok: true } };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sign out everywhere: the requests', () => {
  it('a login signs itself out with POST /api/auth/logout { everywhere: true }', async () => {
    await expect(signOutEverywhere()).resolves.toEqual({ kind: 'ok' });
    expect(calls).toEqual([
      {
        method: 'POST',
        url: expect.stringMatching(/\/api\/auth\/logout$/),
        body: { everywhere: true },
      },
    ]);
  });

  it('an admin signs another login out with PATCH /api/users/:id { signOut: true }', async () => {
    await expect(signLoginOutEverywhere('u-1')).resolves.toEqual({ kind: 'ok' });
    expect(calls).toEqual([
      {
        method: 'PATCH',
        url: expect.stringMatching(/\/api\/users\/u-1$/),
        body: { signOut: true },
      },
    ]);
  });

  it('a 401 is "already signed out", never a bounce, and the network down is said', async () => {
    answer = { status: 401, body: { error: 'unauthorized' } };
    await expect(signOutEverywhere()).resolves.toEqual({ kind: 'signed-out' });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(signOutEverywhere()).resolves.toEqual({
      kind: 'error',
      message: 'Could not reach the brain. Try again.',
    });
  });
});

describe('everywhereOutcome', () => {
  it('says the brain is too old when it refuses the body as empty', () => {
    expect(everywhereOutcome(400, { error: 'Nothing to update.' })).toEqual({
      kind: 'error',
      message: 'This brain cannot do that yet. Update it first.',
    });
  });

  it("passes on the brain's own refusal, and hides a server error's", () => {
    expect(everywhereOutcome(404, { error: 'User not found.' })).toEqual({
      kind: 'error',
      message: 'User not found.',
    });
    expect(everywhereOutcome(500, { error: 'boom' })).toEqual({
      kind: 'error',
      message: 'Could not sign out everywhere. Try again.',
    });
  });
});

describe('the confirm (client logins audit B14)', () => {
  it('admins and members hear about the phone app and connected clients', () => {
    expect(everywhereConfirmText(false)).toBe(
      'This signs you out on every device, this one too. Every browser, the phone app and any connected client must sign in again.',
    );
  });

  it('a client hears about browsers only: it has no phone app and no connected client', () => {
    const text = everywhereConfirmText(true);
    expect(text).toMatch(/^This signs you out on every device, this one too\. Every browser/);
    expect(text).not.toMatch(/phone app|connected client/);
  });
});

describe('the confirm for another login (client tier audit U11)', () => {
  const row = { displayName: 'Pat', email: 'pat@example.invalid' };

  it('an admin or a member: every device, and nothing else changes', () => {
    for (const role of ['admin', 'member']) {
      expect(otherLoginEverywhereText({ ...row, role })).toMatch(
        /phone app.*Nothing else about the login changes\.$/,
      );
    }
  });

  it('a client: its open sign-in link is revoked too, as End sessions says', () => {
    const text = otherLoginEverywhereText({ ...row, role: 'client' });
    expect(text).toContain('any open sign-in link is revoked');
    expect(text).not.toContain('Nothing else about the login changes');
    expect(text).not.toMatch(/phone app|connected client/);
  });
});

describe('the screens that offer it', () => {
  const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('the account menu (admins and members, rail and phone bar) confirms, then signs out here too', () => {
    const menu = src('../components/layout/rail/profile-menu.tsx');
    expect(EVERYWHERE_CONFIRM).toBe('This signs you out on every device, this one too.');
    expect(menu).toContain('<MonitorOff className="size-4" /> Sign out everywhere');
    expect(menu).toContain('{everywhereConfirmText(client)}');
    expect(menu).toMatch(
      /const outcome = await signOutEverywhere\(\);[\s\S]*?return;\s*\}\s*await signOut\(\);/,
    );
  });

  it('Settings > Logins signs a login out everywhere from its Devices card', () => {
    const users = src('../app/(app)/settings/users/users-client.tsx');
    expect(users).toContain('<SignOutEverywhereButton user={user} isSelf={isSelf} />');
    expect(users).toContain(
      'const outcome = isSelf ? await signOutEverywhere() : await signLoginOutEverywhere(user.id);',
    );
  });
});
