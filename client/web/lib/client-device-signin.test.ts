import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A client login on the desktop app, held as a session (desktop only).
 *
 *   - the device sign-in: the requests carry `device: true`, the `requestId`
 *     and a device name, as JSON, with no cookie; a brain that answers
 *     `device-only` (a web page) or a bearer for another role stores nothing;
 *   - a browser never offers it, and keeps its client sign-in as it was
 *     (cookie-only).
 */

type Call = { url: string; init: RequestInit | undefined };
let calls: Call[];
let answer: (call: Call) => { status: number; body: unknown };
let cookies: Map<string, string>;
let store: Map<string, string>;

function desktopVault() {
  const slots = new Map<string, string>();
  return {
    slots,
    get: () => null,
    set: () => {},
    clear: () => {},
    getFor: (id: string) => slots.get(id) ?? null,
    setFor: (id: string, t: string) => void slots.set(id, t),
    clearFor: (id: string) => void slots.delete(id),
    adopt: () => null,
  };
}

function stub(opts: { desktop: boolean }) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: opts.desktop
      ? { protocol: 'http:', origin: 'http://127.0.0.1:4173', href: 'http://127.0.0.1:4173/' }
      : { protocol: 'https:', origin: 'https://app.example', href: 'https://app.example/' },
    __MANTLE_ENV__: opts.desktop ? { apiBase: 'https://brain.example' } : {},
    ...(opts.desktop ? { mantleDesktop: { tokenVault: desktopVault() } } : {}),
  });
  // A cookie jar that keeps name=value, as document.cookie does.
  vi.stubGlobal('document', {
    get cookie() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(line: string) {
      const [pair, ...attrs] = line.split(';');
      const [k, v] = pair!.split('=');
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) cookies.delete(k!.trim());
      else cookies.set(k!.trim(), (v ?? '').trim());
    },
  });
}

const ok = (body: unknown) => ({ status: 200, body });

beforeEach(() => {
  calls = [];
  cookies = new Map();
  store = new Map();
  answer = () => ok({});
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const call = { url: String(url), init };
      calls.push(call);
      const { status, body } = answer(call);
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        redirected: false,
        url: String(url),
        headers: new Headers(),
        json: () => Promise.resolve(body),
      } as unknown as Response);
    }),
  );
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const bodyOf = (c: Call) => JSON.parse(String(c.init?.body)) as Record<string, unknown>;

describe('the device sign-in, from the desktop', () => {
  beforeEach(() => stub({ desktop: true }));

  it('asks for a code in device mode, as JSON and without a cookie', async () => {
    answer = () => ok({ ok: true, requestId: 'req-1' });
    const { askDeviceCode } = await import('./client-device-signin');
    expect(await askDeviceCode(' c@example.com ')).toEqual({ kind: 'sent', requestId: 'req-1' });
    expect(calls[0]!.url).toBe('https://brain.example/api/auth/client-code');
    expect(calls[0]!.init?.credentials).toBe('omit');
    expect(new Headers(calls[0]!.init?.headers).get('content-type')).toBe('application/json');
    expect(bodyOf(calls[0]!)).toEqual({ email: 'c@example.com', device: true });

    // Again with the id held: the open code keeps working.
    await askDeviceCode('c@example.com', 'req-1');
    expect(bodyOf(calls[1]!)).toEqual({ email: 'c@example.com', device: true, requestId: 'req-1' });
  });

  it('trades the code for a client bearer', async () => {
    answer = () =>
      ok({ ok: true, token: 'client.sig', role: 'client', loginId: 'login-c', deviceId: 'd' });
    const { verifyDeviceCode, DESKTOP_CLIENT_DEVICE_NAME } = await import('./client-device-signin');
    expect(
      await verifyDeviceCode({ email: 'c@example.com', code: '1234 5678', requestId: 'req-1' }),
    ).toEqual({ kind: 'ok', token: 'client.sig', loginId: 'login-c' });
    expect(calls[0]!.url).toBe('https://brain.example/api/auth/client-code/verify');
    expect(calls[0]!.init?.credentials).toBe('omit');
    expect(bodyOf(calls[0]!)).toEqual({
      email: 'c@example.com',
      code: '12345678',
      requestId: 'req-1',
      deviceName: DESKTOP_CLIENT_DEVICE_NAME,
    });
  });

  it('a device-only refusal, a wrong code or a bearer for another role stores nothing', async () => {
    const { askDeviceCode, verifyDeviceCode, DEVICE_ONLY_MESSAGE } =
      await import('./client-device-signin');
    answer = () => ({ status: 403, body: { reason: 'device-only' } });
    expect(await askDeviceCode('c@example.com')).toEqual({
      kind: 'error',
      message: DEVICE_ONLY_MESSAGE,
    });
    const input = { email: 'c@example.com', code: '12345678', requestId: 'r' };
    expect((await verifyDeviceCode(input)).kind).toBe('error');
    answer = () => ({ status: 401, body: { error: 'That code did not work. Ask for a new one.' } });
    expect((await verifyDeviceCode(input)).kind).toBe('not-valid');
    answer = () => ok({ ok: true, token: 'admin.sig', role: 'admin' });
    expect((await verifyDeviceCode(input)).kind).toBe('error');
    answer = () => ok({ ok: true, role: 'client' });
    expect((await verifyDeviceCode(input)).kind).toBe('error');
  });

  it('is offered when the brain sends codes, and not when it does not', async () => {
    const { clientLoginAddable } = await import('./client-device-signin');
    answer = () => ok({ enabled: true });
    expect(await clientLoginAddable()).toBe(true);
    answer = () => ok({ enabled: false });
    expect(await clientLoginAddable()).toBe(false);
  });
});

describe('signing back in to a held client login (desktop)', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

  it('the Add login screen opens the client form for a client row, its email filled in', () => {
    const src = read('../app/login/login-client.tsx');
    expect(src).toContain(
      'const target = sessionId ? held.sessions.find((s) => s.id === sessionId) : undefined;',
    );
    expect(src).toContain("if (target?.role === 'client') setKind('client');");
    expect(src).toContain('<ClientDeviceAdd initialEmail={target?.email} />');
  });
});

describe('the browser keeps clients cookie-only', () => {
  beforeEach(() => stub({ desktop: false }));

  it('never offers a client login, and does not even ask the brain', async () => {
    answer = () => ok({ enabled: true });
    const { clientLoginAddable } = await import('./client-device-signin');
    expect(await clientLoginAddable()).toBe(false);
    expect(calls).toEqual([]);
  });

  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

  it('the add screen shows the client form only where clientLoginAddable said so', () => {
    const src = read('../app/login/login-client.tsx');
    expect(src).toContain('void clientLoginAddable().then((ok) => live && setClientAddable(ok));');
    expect(src).toContain('const offerClient = add && !firstRun && clientAddable;');
    expect(src).toContain('const asClient = offerClient && kind === ');
    expect(src).toMatch(/\{asClient \? \( <ClientDeviceAdd /);
  });

  it('the plain client sign-in is as it was: the cookie, no bearer', () => {
    const src = read('../app/client-signin/client-signin-client.tsx');
    expect(src).toContain('tokenStore.clear(); tokenStore.markPresence();');
    expect(src).not.toMatch(/device: true|tokenStore\.signIn/);
  });
});
