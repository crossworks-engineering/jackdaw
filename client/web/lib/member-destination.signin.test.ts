import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Where sign-in lands (client logins C0). The member shell is the probe: a
 * member goes to the member home, a client login to `/` (the shell shows it
 * the client screen there, with no deep link into the owner screens), and
 * anyone else to where they were headed. apiFetch is replaced so the probe
 * answers as each role would.
 */
const probe = vi.hoisted(() => ({ answer: null as null | (() => unknown) }));

vi.mock('@mantle/web-ui/api-fetch', async (importActual) => {
  const actual = await importActual<typeof import('@mantle/web-ui/api-fetch')>();
  return {
    ...actual,
    apiFetch: vi.fn(async () => {
      const a = probe.answer?.();
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
});
