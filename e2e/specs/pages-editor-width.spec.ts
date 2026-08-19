import { expect, test } from '../lib/fixtures';

/**
 * `/pages/[id]` is a full-page route with no list beside it, so it had nothing
 * to drag against. It chose a `max-w-3xl` cap plus a "Full width" button —
 * `mx-auto` and two positions standing in for a measure the reader should just
 * set. Centred prose on a wide display, and a binary escape hatch.
 *
 * `MeasurePane` gives the route the third panel from the master-detail
 * scaffold: content plus an empty spacer, with a remembered handle between
 * them. The body opens at a measure, tucks LEFT, and the drag has no ceiling
 * because the spacer runs to zero.
 *
 * Four assertions, four different regressions. Bring the button back and (1)
 * fails. Re-add `mx-auto` and (2) fails. Drop the spacer and (3) fails, since
 * the route loses its only handle. Put a `max-w-*` back inside the pane and (4)
 * fails — the pane widens and the prose does not follow.
 */
test.describe('pages editor width', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('the editor brings its own measure — left-tucked, draggable, uncapped', async ({
    ownerApi,
    ownerPage,
  }) => {
    const title = `E2E editor width ${Date.now()}`;
    const created = await ownerApi.post('/api/pages', { data: { title } });
    expect(created.ok()).toBeTruthy();
    const { page: row } = (await created.json()) as { page: { id: string } };

    try {
      // No headings: a heading raises the `xl:` outline rail and puts a second
      // box in the geometry below.
      const seeded = await ownerApi.put(`/api/pages/${row.id}/draft`, {
        data: {
          doc: {
            type: 'doc',
            content: Array.from({ length: 8 }, () => ({
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'The measure of this paragraph is whatever the drag leaves it. '.repeat(6),
                },
              ],
            })),
          },
          if_rev: 0,
        },
      });
      expect(seeded.ok(), 'could not seed a body to measure').toBeTruthy();

      // Wide enough that a 920px opening measure leaves real slack to eat.
      await ownerPage.setViewportSize({ width: 1920, height: 1080 });
      await ownerPage.goto(`/pages/${row.id}`);

      const prose = ownerPage.locator('.ProseMirror').first();
      await expect(prose).toBeVisible({ timeout: 20_000 });

      // 1. The two-position stand-in is gone.
      await expect(
        ownerPage.getByRole('button', { name: /Full width/ }),
        'the narrow/wide toggle is back — the drag is meant to be the only measure',
      ).toHaveCount(0);

      // The route's own panel group. Scope to the one holding the content
      // panel: the app shell has a `resizable-handle` of its own for the nav
      // rail, and an unscoped `.last()` grabs whichever painted last.
      const group = ownerPage.locator('[data-slot="resizable-panel-group"][id*="page-editor"]');
      await expect(group, 'the editor has no panel group — MeasurePane is gone').toHaveCount(1);
      const handle = group.locator(':scope > [data-slot="resizable-handle"]');

      // 3. Exactly one handle: content | spacer.
      expect(await handle.count(), 'the spacer is gone, so there is no edge to drag').toBe(1);

      // 2. Tucked left, not centred. `mx-auto` would split the slack evenly.
      const pane = (await group
        .locator(':scope > [data-slot="resizable-panel"]')
        .first()
        .boundingBox())!;
      const before = (await prose.boundingBox())!;
      expect(
        before.x - pane.x,
        'the prose is centred in its pane — an inner `mx-auto` survived',
      ).toBeLessThan(60);

      // 4. Dragging the edge widens the prose, past anything a `max-w-3xl`
      //    (768px) would have allowed.
      const grip = (await handle.boundingBox())!;
      await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await ownerPage.mouse.down();
      await ownerPage.mouse.move(1900, grip.y + grip.height / 2, { steps: 12 });
      await ownerPage.mouse.up();

      await expect
        .poll(async () => (await prose.boundingBox())!.width, {
          message: 'the prose ignored the drag — capped from inside the pane?',
          timeout: 10_000,
        })
        .toBeGreaterThan(before.width + 200);
    } finally {
      const del = await ownerApi.delete(`/api/pages/${row.id}`);
      expect(del.ok()).toBeTruthy();
    }
  });
});
