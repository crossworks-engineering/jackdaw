import { expect, test } from '../lib/fixtures';

/**
 * `/pages` has declared its reading width three different ways.
 *
 * First a per-page narrow/wide toggle (`mx-auto` + `max-w-3xl` / `max-w-none`,
 * persisted as `data.width`) sitting inside a draggable pane — two controls for
 * one measure, and dragging the divider on a "narrow" page moved the pane but
 * not the prose. The toggle went; `detailFills` replaced it, so the pane took
 * every spare pixel.
 *
 * That was the second mistake, and it is the one this spec now guards. Under
 * `detailFills` the page sprawled the full window with NO right edge to take
 * hold of: the reader could widen the list, and nothing else. Jason's words —
 * the content "is all just full width", with "no drag handle to resize
 * content". A document the reader READS wants what the settings hub has: an
 * opening measure, tucked left against the divider, with its own handle on the
 * right and `maxDetailSize="100%"` so that handle has no ceiling.
 *
 * Three assertions, because three different regressions are possible. Re-add an
 * inner `mx-auto` and (2) fails. Re-add `detailFills` — or drop the spacer any
 * other way — and (3) fails, because the pane loses its own handle. Put the
 * 1100px default ceiling back and (4) fails.
 */
test.describe('pages reading width', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  /** The scaffold's OWN handles. `[data-slot="resizable-handle"]` alone also
   *  matches the app shell's nav rail, so scope to the group holding the list
   *  and take only its direct children — same helper as
   *  `master-detail-screens.spec.ts` and `settings-hub.spec.ts`. */
  const scaffoldHandles = (page: import('@playwright/test').Page) =>
    page
      .locator('[data-slot="resizable-panel-group"]:has([data-testid="list"])')
      .last()
      .locator(':scope > [data-slot="resizable-handle"]');

  test('the preview opens at a measure, hugs the divider, and has its own drag bar', async ({
    ownerApi,
    ownerPage,
  }) => {
    const title = `E2E reading width ${Date.now()}`;
    const created = await ownerApi.post('/api/pages', { data: { title } });
    expect(created.ok()).toBeTruthy();
    const { page: row } = (await created.json()) as { page: { id: string } };

    try {
      // Seed a body. A page created through POST alone has nothing to render,
      // and the preview shows its "couldn't load" line instead of prose — which
      // would fail this spec for the wrong reason. The draft is enough: the
      // preview renders `draft ?? doc`. No headings, deliberately — a heading
      // would raise the xl outline rail and put a second box in the geometry.
      const seeded = await ownerApi.put(`/api/pages/${row.id}/draft`, {
        data: {
          doc: {
            type: 'doc',
            content: Array.from({ length: 6 }, () => ({
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'The measure of this paragraph is whatever the divider leaves it. '.repeat(
                    6,
                  ),
                },
              ],
            })),
          },
          if_rev: 0,
        },
      });
      expect(seeded.ok(), 'could not seed a body to measure').toBeTruthy();

      // Wide enough that a 900px opening measure leaves real slack in the
      // spacer for the drag to eat.
      await ownerPage.setViewportSize({ width: 1920, height: 1080 });
      await ownerPage.goto(`/pages?q=${encodeURIComponent(title)}`);
      await expect(scaffoldHandles(ownerPage).first()).toBeVisible({ timeout: 15_000 });
      await ownerPage.getByText(title).first().click();

      const detail = ownerPage.locator('[data-testid="detail"]');
      const prose = detail.locator('.ProseMirror').first();
      await expect(prose).toBeVisible({ timeout: 15_000 });

      // 1. The per-page toggle is still gone from the workspace. (The EDITOR at
      //    /pages/[id] is a separate route and a separate decision.)
      await expect(
        detail.getByRole('button', { name: 'Toggle full width' }),
        'the workspace width toggle is back — the divider is meant to be the only measure',
      ).toHaveCount(0);

      const pane = (await detail.boundingBox())!;
      const body = (await prose.boundingBox())!;

      // 2. Not centred. `mx-auto` would split the slack evenly and push the left
      //    edge well clear of the divider; tucked left keeps it at the padding.
      expect(
        body.x - pane.x,
        'prose is not hugging the divider — `mx-auto` back on the wrapper?',
      ).toBeLessThan(40);

      // 3. The pane opens at a MEASURE, not at the whole window, and it has a
      //    second handle of its own. Under `detailFills` there is exactly one
      //    scaffold handle and the pane runs to the shell's edge.
      const handles = scaffoldHandles(ownerPage);
      expect(
        await handles.count(),
        'the preview has no right edge to drag — `detailFills` is back and the spacer is gone',
      ).toBe(2);
      expect(
        pane.width,
        `the pane opened at ${Math.round(pane.width)}px — it is filling, not opening at a measure`,
      ).toBeLessThan(1200);

      // 4. And the drag has NO ceiling: `maxDetailSize="100%"` lets it run the
      //    spacer down to nothing. The 1100px default would stop it short.
      const grip = (await handles.last().boundingBox())!;
      await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await ownerPage.mouse.down();
      await ownerPage.mouse.move(1900, grip.y + grip.height / 2, { steps: 12 });
      await ownerPage.mouse.up();

      await expect
        .poll(async () => (await prose.boundingBox())!.width, {
          message: 'the prose ignored its own handle — capped from inside, or the ceiling is back',
        })
        .toBeGreaterThan(body.width + 200);
    } finally {
      const del = await ownerApi.delete(`/api/pages/${row.id}`);
      expect(del.ok()).toBeTruthy();
    }
  });
});
