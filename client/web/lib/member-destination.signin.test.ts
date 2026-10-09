import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Where sign-in lands (client logins C0). The member shell is the probe: a
 * member goes to the member home, a client login to `/` (the shell shows it
 * the client screen there, with no deep link into the owner screens), and
 * anyone else to where they were headed. apiFetch is replaced so the probe
 * answers as each role would.
 */
const probe = vi.hoisted(() => ({
  answer: null as null | ((path: string) => unknown),
  asked: [] as string[],
}));

vi.mock('@mantle/web-ui/api-fetch', async (importActual) => {
  const actual = await importActual<typeof import('@mantle/web-ui/api-fetch')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      probe.asked.push(path);
      const a = probe.answer?.(path);
      if (a instanceof Error) throw a;
      return a;
    }),
  };
});

const { ApiError } = await import('@mantle/web-ui/api-fetch');
const { destinationAfterSignIn } = await import('./member-destination');

const refused = (reason: string) => new ApiError('forbidden', 403, { error: 'forbidden', reason });

afterEach(() => {
  probe.answer = null;
  probe.asked = [];
});

describe('destinationAfterSignIn', () => {
  it('sends a member to the member home, keeping a path a member may open', async () => {
    probe.answer = () => ({ role: 'member' });
    expect(await destinationAfterSignIn('/pages/abc')).toBe('/pages/abc');
    expect(await destinationAfterSignIn('/settings')).toBe('/');
  });

  it('sends an admin (admin-login from the member route) where they were headed', async () => {
    probe.answer = () => refused('admin-login');
    expect(await destinationAfterSignIn('/settings')).toBe('/settings');
    expect(await destinationAfterSignIn(null)).toBe('/');
  });

  it('sends a client login to / and never to the deep link', async () => {
    probe.answer = () => refused('client-login');
    expect(await destinationAfterSignIn('/settings')).toBe('/');
    expect(await destinationAfterSignIn('/team-admin?view=shares')).toBe('/');
    expect(await destinationAfterSignIn(null)).toBe('/');
  });

  it('asks the client shell after a client refusal (client logins C2), and lands home either way', async () => {
    probe.answer = (path) =>
      path === '/api/client/shell' ? { role: 'client' } : refused('client-login');
    expect(await destinationAfterSignIn('/settings')).toBe('/');
    expect(probe.asked).toEqual(['/api/member/shell', '/api/client/shell']);
    // A brain without the client routes: still the home, never the deep link.
    probe.asked = [];
    probe.answer = (path) =>
      path === '/api/client/shell' ? new ApiError('nf', 404) : refused('client-login');
    expect(await destinationAfterSignIn('/settings')).toBe('/');
    expect(probe.asked).toEqual(['/api/member/shell', '/api/client/shell']);
  });

  it('sends a member or an admin back to the MCP consent page, never a client', async () => {
    const consent = '/api/oauth/authorize?response_type=code&client_id=c1&state=s';
    probe.answer = () => ({ role: 'member' });
    expect(await destinationAfterSignIn(consent)).toBe(consent);
    // Any other /api path is still not a member's place.
    expect(await destinationAfterSignIn('/api/oauth/token')).toBe('/');
    probe.answer = () => refused('admin-login');
    expect(await destinationAfterSignIn(consent)).toBe(consent);
    probe.answer = (path) =>
      path === '/api/client/shell' ? { role: 'client' } : refused('client-login');
    expect(await destinationAfterSignIn(consent)).toBe('/');
  });

  it('asks nothing more of a member or an admin', async () => {
    probe.answer = () => ({ role: 'member' });
    await destinationAfterSignIn(null);
    probe.answer = () => refused('admin-login');
    await destinationAfterSignIn(null);
    expect(probe.asked).toEqual(['/api/member/shell', '/api/member/shell']);
  });
});
