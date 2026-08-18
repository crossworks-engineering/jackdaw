import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../lib/fixtures';
import { ARTIFACTS_DIR } from '../lib/env';

/**
 * `/apps`, the last phase-2a screen — and the one that was blocked, because it
 * is the only ported screen with focus mode.
 *
 * The scaffold half is one row in `master-detail-screens.spec.ts`. What is here
 * is the capability that unblocked it, and it is worth stating precisely: in
 * focus mode the list column goes to zero width but is **still mounted**. The
 * cheap version of this feature is `{zen ? null : list}`, which looks identical
 * in a screenshot and silently throws away the user's search text, scroll
 * position and page every time they toggle. The whole point of the
 * `MasterDetail` change is that it does NOT do that, so that is what these
 * tests assert — not the width, which both versions would pass.
 */

/** The screen renders its preview (and the focus toggle) only with a selection,
 *  so every test needs one app to exist. Returns a cleanup. */
async function withApp(
  ownerApi: APIRequestContext,
  run: (app: { id: string; title: string }) => Promise<void>,
) {
  const name = `E2E app ${Date.now()}`;
  const created = await ownerApi.post('/api/apps', { data: { name } });
  expect(created.status(), 'could not create the fixture app').toBeLessThan(300);
  const { app } = (await created.json()) as { app: { id: string } };
  try {
    await run({ id: app.id, title: name });
  } finally {
    await ownerApi.delete(`/api/apps/${app.id}`);
  }
}

test.describe('apps', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('focus mode collapses the list WITHOUT unmounting it', async ({ ownerApi, ownerPage }) => {
    await withApp(ownerApi, async () => {
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto('/apps');

      const list = ownerPage.locator('[data-testid="list"]');
      const search = ownerPage.getByPlaceholder('Search apps…');
      await expect(list).toBeVisible();
      await expect(search).toBeVisible();

      // State the user would lose if the column were unmounted. Typed, not
      // submitted, so it lives only in the component — exactly the kind of
      // thing a remount discards.
      await search.fill('half-typed query');
      const widthOf = () => list.evaluate((el) => (el as HTMLElement).offsetWidth);
      const expanded = await widthOf();
      expect(expanded, 'the list should start at its 340px column').toBeGreaterThan(300);

      await ownerPage.getByRole('button', { name: 'Focus mode' }).click();

      // Collapsed...
      await expect.poll(widthOf, 'the list did not collapse').toBeLessThanOrEqual(1);
      // ...but STILL THERE, with what the user typed. `count()` rather than
      // `toBeVisible()`: zero-width is correctly not visible, and that is the
      // whole distinction this test exists to draw.
      expect(await search.count(), 'the list was UNMOUNTED, not collapsed').toBe(1);
      expect(await search.inputValue(), 'the search box lost its text — the column remounted').toBe(
        'half-typed query',
      );
      await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}apps-focus-collapsed.png` });

      await ownerPage.getByRole('button', { name: 'Exit focus mode' }).click();

      // And back, to the SAME width and the same text. Polled on the delta
      // rather than on "> 300": leaving focus gives the shell its chrome back,
      // so the panel group narrows (1600 → 1288 here) a frame or two after the
      // list reappears, and a width sampled in between is legitimately wider.
      await expect
        .poll(async () => Math.abs((await widthOf()) - expanded), {
          message: 'the list did not come back to the width it left at',
        })
        .toBeLessThan(3);
      expect(await search.inputValue()).toBe('half-typed query');

      // A collapse must not be PERSISTED. `onlySaveAfterUserInteractions` is
      // what stops it, and if it ever stopped working the list would be gone
      // after a reload with no handle left to drag it back — unrecoverable
      // without clearing localStorage.
      await ownerPage.reload();
      await expect(ownerPage.getByPlaceholder('Search apps…')).toBeVisible();
      await expect.poll(widthOf, 'a collapsed width was saved and reloaded').toBeGreaterThan(300);
    });
  });

  test('the preview fills the pane rather than stopping at a text measure', async ({
    ownerApi,
    ownerPage,
  }) => {
    await withApp(ownerApi, async () => {
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto('/apps');

      const group = ownerPage.locator('[data-slot="resizable-panel-group"]').first();
      const detail = ownerPage.locator('[data-testid="detail"]');
      await expect(detail).toBeVisible();

      // `detailFills`: no empty spacer panel, so the detail's right edge is the
      // group's right edge. With the 672px default an app viewport would be
      // capped at a reading measure and the rest of a 1600px window left blank.
      const groupBox = (await group.boundingBox())!;
      const detailBox = (await detail.boundingBox())!;
      const gap = groupBox.x + groupBox.width - (detailBox.x + detailBox.width);
      expect(gap, 'a spacer is still eating the right-hand side').toBeLessThan(4);
      expect(detailBox.width, 'the preview is capped near the 672px measure').toBeGreaterThan(900);
    });
  });

  test('creating an app with no name says so instead of doing nothing', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/apps');

    await ownerPage.getByRole('button', { name: 'New app' }).click();
    const dialog = ownerPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New app' })).toBeVisible();

    const name = dialog.getByLabel('Name');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');

    // Was a bare `return` — the button appeared inert and nothing explained why.
    await dialog.getByRole('button', { name: 'Create app' }).click();
    await expect(dialog).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    const error = dialog.getByRole('alert');
    await expect(error).toHaveText('A name is required');
    expect(await name.getAttribute('aria-describedby')).toBe(await error.getAttribute('id'));

    // Typing clears it, so the mark tracks the field rather than sticking.
    await name.fill('Weather');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  });
});
