import { expect, test } from '../lib/fixtures';

/**
 * The half-state, which nothing covered until this file.
 *
 * `focus-mode.spec.ts` holds the LIVE collapse — click focus mode, the column
 * goes to zero and its children stay mounted. That round trip was never the
 * broken half. What broke is the RESTORE: `/tables` is the only screen that
 * persists its collapse (`tables.listCollapsed`), so it is the only one that
 * reloads into a collapsed state at all, and on reload the collapsed rail came
 * back while the list panel stayed at its full width — both on screen at once,
 * the rail offering to "show" a list that was never hidden.
 *
 * Two preconditions matter and neither is incidental, so the test sets both up
 * rather than trusting a clean profile:
 *
 * - **A width the user dragged.** `onlySaveAfterUserInteractions` keeps a
 *   collapsed 0 out of the saved layout, so what `defaultLayout` holds on the
 *   next load is the last width the list was dragged to. With no drag there is
 *   no saved layout to lose the race to, and the bug hides.
 * - **A reload, not a re-render.** The panel group reads `defaultLayout` on
 *   mount only. Toggling collapse in a live page never replays that path.
 */
test.describe('master-detail collapse restore', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('a persisted collapse survives a reload without stranding the list', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/tables');

    const list = ownerPage.locator('[data-testid="list"]');
    await expect(list, 'no list panel — still a hand-written grid?').toBeVisible();

    const widthOf = () => list.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(await widthOf(), 'the list should start at its own column width').toBeGreaterThan(200);

    // Precondition one: a width this screen will try to restore. Dragging is
    // the only thing that writes the layout, by design.
    const handle = ownerPage
      .locator('[data-slot="resizable-panel-group"]:has([data-testid="list"])')
      .last()
      .locator(':scope > [data-slot="resizable-handle"]')
      .first();
    const grip = (await handle.boundingBox())!;
    await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await ownerPage.mouse.down();
    await ownerPage.mouse.move(grip.x + grip.width / 2 + 80, grip.y + grip.height / 2, {
      steps: 8,
    });
    await ownerPage.mouse.up();
    const dragged = await widthOf();
    expect(dragged, 'the divider did not move').toBeGreaterThan(200);

    await ownerPage.getByRole('button', { name: 'Collapse list' }).click();
    await expect.poll(widthOf, 'the list did not collapse').toBeLessThanOrEqual(1);

    // The rail is the only way back, so its presence is how "collapsed" is
    // read off the screen rather than out of localStorage.
    const rail = ownerPage.getByRole('button', { name: 'Show table list' });
    await expect(rail, 'no collapsed rail to get back from').toBeVisible();

    await ownerPage.reload();

    // The state came back...
    await expect(rail, 'the collapse was not persisted at all').toBeVisible();
    // ...and so must the collapse itself. This is the assertion the file exists
    // for: the rail and a full-width list on screen together is the half-state.
    await expect
      .poll(widthOf, 'HALF-STATE: the rail restored but the list kept its width')
      .toBeLessThanOrEqual(1);
  });
});
