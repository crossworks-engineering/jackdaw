import { expect, test } from '../lib/fixtures';

/**
 * /team-admin on the CLIENT origin (T5): the owner's team console renders
 * from the per-tab /api/team-admin/* routes with the owner credential:
 * bearer in the split project, session cookie same-origin. The old server
 * page is gone; this is the only surface.
 *
 * Team admin is dissolving in parts (2026-10-09). Part 1 moved Invites,
 * Clients, What clients see and the member chats into Settings > Logins and
 * removed the Chat archive, so the tabs left are Review (the landing tab),
 * Requests, Shared links and Settings, and the old links are sent on.
 */
test.describe('team admin (owner, client origin)', () => {
  // Post-carve, the owner UI exists only on the CLIENT app: the same-origin
  // project covers the SERVER-origin surfaces; the split project runs this.
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');
  test('tabs render from the per-tab API routes', async ({ ownerPage }) => {
    await ownerPage.goto('/team-admin');
    // Scoped to the tab strip: the sidebar now carries a "Settings" row of its
    // own (the settings hub), so an unscoped link-by-name is ambiguous.
    const tabs = ownerPage.getByRole('navigation', { name: 'Team admin' });
    // Review is the landing tab: the review queue's grid, empty or not.
    await expect(tabs.getByRole('link', { name: /^Review/ })).toHaveAttribute(
      'href',
      '/team-admin?view=review',
      { timeout: 30_000 },
    );
    await expect(ownerPage.getByRole('heading', { name: 'Review', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // The four tabs left, in order, and none of the ones that moved or went.
    // (Not the "waiting in Apps" link the strip shows while a member's app
    // waits: that is a way out, not a tab.)
    await expect(tabs.locator('a:not([href="/apps"])')).toHaveText([
      /^Review/,
      /^Requests/,
      'Shared links',
      'Settings',
    ]);
    for (const gone of ['Chat archive', 'Member chats', 'Invites', 'Clients', 'Code holders']) {
      await expect(tabs.getByRole('link', { name: gone })).toHaveCount(0);
    }
    await expect(ownerPage.getByText(/code last used/i)).toHaveCount(0);

    // Requests tab: empty-state or queue, either way the pane rendered.
    await tabs.getByRole('link', { name: /^Requests/ }).click();
    await expect(
      ownerPage
        .getByText(/No change requests yet/)
        .or(ownerPage.getByRole('heading', { name: 'Change requests' }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Settings tab: the surface-wide switches, and no dashboard-tags card (its
    // route went with the retired /hub).
    await tabs.getByRole('link', { name: 'Settings' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'Read posture' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(ownerPage.getByRole('heading', { name: 'Member home app' })).toBeVisible();
    await expect(ownerPage.getByRole('heading', { name: 'Dashboard sections' })).toHaveCount(0);

    // The forum's Topics tab is gone with the retired portal (member logins
    // Phase 6), and so is its export (brain 0177 dropped the forum tables).
    await expect(tabs.getByRole('link', { name: /^Topics/ })).toHaveCount(0);
  });

  test('the moved tabs live in Settings > Logins, and their old links go there', async ({
    ownerPage,
  }) => {
    // Every old link of a moved tab, and where it lands now. Client-side
    // redirects, so each waits for the address to change.
    for (const [from, to] of [
      ['/team-admin?view=invites', /\/settings\/users$/],
      ['/team-admin?view=chats', /\/settings\/users$/],
      ['/team-admin?view=clients', /\/settings\/users\?selected=what-clients-see$/],
      ['/team-admin?view=client-logins', /\/settings\/users\?selected=what-clients-see$/],
    ] as const) {
      await ownerPage.goto(from);
      await expect(ownerPage).toHaveURL(to, { timeout: 30_000 });
    }

    // What clients see opened as the selected step: its one header, with the
    // count and the intro behind Info.
    const header = ownerPage.getByTestId('item-header');
    await expect(header.getByRole('heading', { name: /^What clients see/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(header.getByRole('button', { name: 'About this list' })).toBeVisible();

    // The Logins column: Invite beside Add login, and the Clients section with
    // its two steps.
    await expect(ownerPage.getByRole('button', { name: 'Invite', exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'Add login' })).toBeVisible();
    const clients = ownerPage.getByRole('region', { name: /^Clients/ });
    await expect(clients.getByRole('button', { name: 'Add client' })).toBeVisible();
    await expect(clients.getByRole('button', { name: /^What clients see/ })).toBeVisible();
    await expect(clients.getByRole('button', { name: /^Client settings/ })).toBeVisible();

    // An old Member chats link to one login opens that login's Chat. No
    // member login is seeded on this brain, so the id is no login and the
    // screen shows its first login: what matters is where the link lands.
    await ownerPage.goto('/team-admin?view=chats&login=not-a-login');
    await expect(ownerPage).toHaveURL(/\/settings\/users\?selected=not-a-login&view=chat$/, {
      timeout: 30_000,
    });

    // The Chat archive is gone: its old URL lands on Review.
    await ownerPage.goto('/team-admin?contact=00000000-0000-4000-8000-000000000000');
    await expect(ownerPage.getByRole('heading', { name: 'Review', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(ownerPage.getByRole('heading', { name: 'Chat archive' })).toHaveCount(0);
  });

  // DROPPED 2026-10-09: "Chat archive and Member chats each remember their
  // OWN width". Its subject was two grids in this file that are gone (Chat
  // archive removed, Member chats now a login's Chat in Settings > Logins).
  // Of the grids left, Requests and Shared links draw one only when they have
  // rows, which this brain need not have, so a two-grid width check here would
  // skip or pass vacuously. Review's own key is held by the /team-admin row of
  // master-detail-screens.spec.ts (team-admin-review), and Settings > Logins'
  // by its /settings/users row (settings-users).
});
