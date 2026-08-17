import { expect, test } from '../lib/fixtures';

/**
 * The shared field primitives, measured in a browser rather than grepped.
 *
 * `Input` and `Textarea` both carry `text-base md:text-sm`, and the reason is
 * one specific mobile bug: iOS Safari zooms the whole page in when a focused
 * field's text is under 16px, and it does not zoom back out — every tap on a
 * form left the user pinching. `Textarea` had the guard for a long time and
 * `Input` did not, which is exactly the kind of divergence a class list hides.
 *
 * Asserted as a computed font-size at two widths, because that is the thing iOS
 * actually reacts to. A grep for the class would pass on a screen that overrides
 * it, and would fail on one that spells it differently.
 */

/** Below iOS's threshold and Safari zooms on focus. Not a design preference. */
const IOS_ZOOM_FLOOR_PX = 16;

test.describe('field primitives', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('Input and Textarea are 16px on a phone and 14px from md up', async ({
    ownerApi,
    ownerPage,
  }) => {
    // A task, so the detail pane renders its comment composer — the Textarea.
    // The list's search box is the Input. Both live on this one screen.
    const marker = `E2E field sizes ${Date.now()}`;
    const created = await ownerApi.post('/api/tasks', { data: { title: `${marker} probe` } });
    expect(created.status()).toBe(201);
    const { task } = (await created.json()) as { task: { id: string } };

    try {
      await ownerPage.setViewportSize({ width: 375, height: 812 });
      await ownerPage.goto(`/tasks?q=${encodeURIComponent(marker)}`);

      const input = ownerPage.getByPlaceholder('Search tasks…');
      const textarea = ownerPage.getByPlaceholder(/Write a comment/);
      await expect(input).toBeVisible();
      await expect(textarea).toBeVisible();

      const sizeOf = (locator: typeof input) =>
        locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));

      for (const [name, locator] of [
        ['Input', input],
        ['Textarea', textarea],
      ] as const) {
        expect(
          await sizeOf(locator),
          `${name} under ${IOS_ZOOM_FLOOR_PX}px on a phone — iOS will zoom on focus and not zoom back`,
        ).toBeGreaterThanOrEqual(IOS_ZOOM_FLOOR_PX);
      }

      // From `md` up the app's own `text-sm` takes over; a permanent 16px would
      // make every form on a desktop a size larger than the text beside it.
      await ownerPage.setViewportSize({ width: 1280, height: 800 });
      for (const [name, locator] of [
        ['Input', input],
        ['Textarea', textarea],
      ] as const) {
        expect(await sizeOf(locator), `${name} should be text-sm from md up`).toBeLessThan(
          IOS_ZOOM_FLOOR_PX,
        );
      }
    } finally {
      await ownerApi.delete(`/api/tasks/${task.id}`);
    }
  });
});
