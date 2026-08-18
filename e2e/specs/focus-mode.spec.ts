import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from '../lib/fixtures';
import { ARTIFACTS_DIR } from '../lib/env';

/**
 * Focus mode on the list screens that have it — Notes first; Draw and Pages
 * join the table as they are ported.
 *
 * Their scaffold half is one row each in `master-detail-screens.spec.ts`. What
 * is here is the half the port could get wrong for free: in focus mode the list
 * column goes to zero width but is **still mounted**. The cheap version is
 * `list={zen ? null : …}`, which looks identical in a screenshot and throws the
 * column away on every toggle.
 *
 * ⚠ `inputValue()` is deliberately NOT the guard here, unlike `apps.spec.ts`.
 * On every one of these screens the search box is a controlled input whose state lives in
 * the SCREEN component, not inside the list subtree — so React re-renders it
 * with the same text even after a real unmount, and an `inputValue` assertion
 * would pass with `{zen ? null : list}` deliberately put back. `count()` is what
 * actually separates the two, so `count()` is what this file asserts. (Not
 * `toBeVisible()`: a zero-width element is correctly invisible, and that is the
 * distinction these tests exist to draw.)
 */

type Screen = {
  path: string;
  /** The list column's search box — a thing that lives INSIDE the column. */
  search: string;
  /** Create the row the preview needs, and return a cleanup. */
  fixture: (api: APIRequestContext) => Promise<() => Promise<void>>;
  /** Some screens hide the toggle until the detail is in the right state. */
  reveal?: (page: Page) => Promise<void>;
};

/** POST a row, hand back a deleter. Every one of these takes `{ title }`. */
function creates(collection: string): Screen['fixture'] {
  return async (api) => {
    const res = await api.post(`/api/${collection}`, {
      data: { title: `E2E focus ${Date.now()}` },
    });
    expect(res.status(), `could not create the ${collection} fixture`).toBeLessThan(300);
    const body = (await res.json()) as Record<string, { id: string }>;
    const id = Object.values(body)[0]?.id;
    return async () => {
      if (id) await api.delete(`/api/${collection}/${id}`);
    };
  };
}

const SCREENS: Screen[] = [
  {
    path: '/notes',
    search: 'Search notes…',
    fixture: creates('notes'),
    // Notes puts the toggle in the EDITOR header rather than the preview's, so
    // the mode only exists once something is being written.
    reveal: async (page) => {
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await expect(page.getByPlaceholder('Untitled note')).toBeVisible();
    },
  },
];

test.describe('focus mode', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  for (const screen of SCREENS) {
    test(`${screen.path} collapses the list WITHOUT unmounting it`, async ({
      ownerApi,
      ownerPage,
    }) => {
      const cleanup = await screen.fixture(ownerApi);
      try {
        await ownerPage.setViewportSize({ width: 1600, height: 900 });
        await ownerPage.goto(screen.path);

        const list = ownerPage.locator('[data-testid="list"]');
        await expect(list, 'no list panel — still a hand-written grid?').toBeVisible();
        await screen.reveal?.(ownerPage);

        // A handle on something that lives INSIDE the list column, so "is it
        // still there" is a question about the column and not about the screen
        // around it.
        const inList = ownerPage.getByPlaceholder(screen.search);
        expect(await inList.count(), 'no search box to count').toBe(1);

        const widthOf = () => list.evaluate((el) => (el as HTMLElement).offsetWidth);
        const expanded = await widthOf();
        expect(expanded, 'the list should start at its own column width').toBeGreaterThan(200);

        await ownerPage.getByRole('button', { name: 'Focus mode' }).first().click();

        // Collapsed...
        await expect.poll(widthOf, 'the list did not collapse').toBeLessThanOrEqual(1);
        // ...but STILL THERE. This is the assertion the whole file exists for:
        // `list={zen ? null : …}` takes this to 0.
        expect(await inList.count(), 'the list was UNMOUNTED, not collapsed').toBe(1);
        // And no divider left hanging at the screen edge, dragging a column the
        // user has just asked to be rid of.
        expect(
          await ownerPage
            .locator('[data-slot="resizable-panel-group"] [data-slot="resizable-handle"]')
            .count(),
          'a handle survived the collapse',
        ).toBe(0);
        await ownerPage.screenshot({
          path: `${ARTIFACTS_DIR}focus-${screen.path.slice(1)}-collapsed.png`,
        });

        await ownerPage.getByRole('button', { name: 'Exit focus mode' }).first().click();

        // And back, to the SAME width. Polled on the delta rather than on a bare
        // threshold: leaving focus gives the shell its chrome back, so the panel
        // group narrows a frame or two after the list reappears and a width
        // sampled in between is legitimately wider.
        await expect
          .poll(async () => Math.abs((await widthOf()) - expanded), {
            message: 'the list did not come back to the width it left at',
          })
          .toBeLessThan(3);
        expect(await inList.count()).toBe(1);

        // A collapse must not be PERSISTED. `onlySaveAfterUserInteractions` is
        // what stops it; without it the list would be gone after a reload with
        // no handle left to drag it back.
        await ownerPage.reload();
        await expect(list).toBeVisible();
        await expect.poll(widthOf, 'a collapsed width was saved and reloaded').toBeGreaterThan(200);
      } finally {
        await cleanup();
      }
    });
  }
});
