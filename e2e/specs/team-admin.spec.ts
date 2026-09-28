import { expect, test } from '../lib/fixtures';

/**
 * /team-admin on the CLIENT origin (T5): the owner's team console renders
 * from the per-tab /api/team-admin/* routes with the owner credential —
 * bearer in the split project, session cookie same-origin. The old server
 * page is gone; this is the only surface.
 */
test.describe('team admin (owner, client origin)', () => {
  // Post-carve, the owner UI exists only on the CLIENT app — the same-origin
  // project covers the SERVER-origin surfaces; the split project runs this.
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');
  test('tabs render from the per-tab API routes', async ({ ownerPage }) => {
    await ownerPage.goto('/team-admin');
    // Scoped to the tab strip: the sidebar now carries a "Settings" row of its
    // own (the settings hub), so an unscoped link-by-name is ambiguous.
    const tabs = ownerPage.getByRole('navigation', { name: 'Team admin' });
    // Code holders tab (default): the roster pane header.
    await expect(ownerPage.getByRole('heading', { name: 'Team-code holders' })).toBeVisible({
      timeout: 30_000,
    });

    // Member chats tab: member logins' chats with the team agent.
    await tabs.getByRole('link', { name: 'Member chats' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'Member chats' })).toBeVisible({
      timeout: 15_000,
    });

    // Requests tab: empty-state or queue — either way the pane rendered.
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
    // Phase 6); its export to Pages stays, on Code holders.
    await expect(tabs.getByRole('link', { name: /^Topics/ })).toHaveCount(0);
  });

  test('Code holders and Member chats each remember their OWN width', async ({ ownerPage }) => {
    // Two grids in one file. They could have shared a `MasterDetail` id, and
    // that is exactly what this rules out: a code-holder roster and a member
    // login list are different lengths, so a width dragged on one must not
    // follow the reader to the other.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/team-admin');

    const list = ownerPage.locator('[data-testid="list"]');
    // The scaffold's own divider — NOT the shell's rail, and not the
    // thread/access split inside the detail pane.
    const handle = ownerPage
      .locator('[data-slot="resizable-panel-group"]:has([data-testid="list"])')
      .last()
      .locator(':scope > [data-slot="resizable-handle"]')
      .first();
    await expect(handle).toBeVisible({ timeout: 30_000 });
    const widthOf = () => list.evaluate((el) => (el as HTMLElement).offsetWidth);
    const before = await widthOf();

    const grip = (await handle.boundingBox())!;
    await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await ownerPage.mouse.down();
    await ownerPage.mouse.move(grip.x + grip.width / 2 + 120, grip.y + grip.height / 2, {
      steps: 8,
    });
    await ownerPage.mouse.up();
    const widened = await widthOf();
    expect(widened, 'the Code holders divider did not move').toBeGreaterThan(before + 60);

    await ownerPage
      .getByRole('navigation', { name: 'Team admin' })
      .getByRole('link', { name: 'Member chats' })
      .click();
    await expect(ownerPage.getByRole('heading', { name: 'Member chats' })).toBeVisible({
      timeout: 15_000,
    });
    expect(
      Math.abs((await widthOf()) - widened),
      'Member chats inherited the width dragged on Code holders: shared key?',
    ).toBeGreaterThan(3);

    // Drag Member chats too, then look at what was written. A layout is only
    // saved after a real interaction on that screen, so without this second
    // drag its key would be legitimately absent and the check below vacuous.
    const chatsHandle = ownerPage
      .locator('[data-slot="resizable-panel-group"]:has([data-testid="list"])')
      .last()
      .locator(':scope > [data-slot="resizable-handle"]')
      .first();
    const chatsGrip = (await chatsHandle.boundingBox())!;
    await ownerPage.mouse.move(chatsGrip.x + chatsGrip.width / 2, chatsGrip.y + 40);
    await ownerPage.mouse.down();
    await ownerPage.mouse.move(chatsGrip.x + chatsGrip.width / 2 + 60, chatsGrip.y + 40, {
      steps: 8,
    });
    await ownerPage.mouse.up();

    // Two saved layouts, not one. (Matched loosely: the panel library owns the
    // exact key shape around the id we hand it.)
    const keys = await ownerPage.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.includes('master-detail')),
    );
    expect(keys.some((k) => k.includes('team-admin-members'))).toBe(true);
    expect(keys.some((k) => k.includes('team-admin-member-chats'))).toBe(true);
  });
});
