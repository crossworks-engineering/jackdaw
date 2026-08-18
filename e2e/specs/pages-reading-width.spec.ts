import { expect, test } from '../lib/fixtures';

/**
 * `/pages` used to declare its reading width TWICE — the `MasterDetail` divider,
 * and a per-page narrow/wide toggle that predates it (`mx-auto` + `max-w-3xl` /
 * `max-w-none`, persisted as `data.width`). Two controls for one measure, and
 * dragging the divider on a "narrow" page moved the pane but not the prose.
 *
 * The workspace toggle is gone: the divider is the measure, and the preview sits
 * TUCKED LEFT against it (§8 — a detail pane hugs the divider and never centres).
 * The EDITOR at /pages/[id] keeps its own toggle, deliberately: it is a full-page
 * route with no divider, so removing it there would leave a long page with no
 * width choice at all. `data.width` therefore lives on, now written from one
 * place instead of two.
 *
 * This spec is the guard for the half a scaffold check cannot see. The
 * master-detail row proves the panes resize; only geometry proves the PROSE
 * followed. Re-add `mx-auto` and the second assertion fails; re-add `max-w-3xl`
 * and the first one does.
 */
test.describe('pages reading width', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('the divider is the measure — prose fills the pane and is not centred', async ({
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

      // Wide enough that a 768px cap is unmistakably narrower than the pane.
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/pages?q=${encodeURIComponent(title)}`);
      await ownerPage.getByText(title).first().click();

      const detail = ownerPage.locator('[data-testid="detail"]');
      const prose = detail.locator('.ProseMirror').first();
      await expect(prose).toBeVisible({ timeout: 15_000 });

      // The control is gone from the workspace. (It is still the editor's, so
      // this is scoped to the pane rather than the page.)
      await expect(
        detail.getByRole('button', { name: 'Toggle full width' }),
        'the workspace width toggle is back — the divider is meant to be the only measure',
      ).toHaveCount(0);

      const pane = (await detail.boundingBox())!;
      const body = (await prose.boundingBox())!;

      // 1. No cap. `max-w-3xl` is 768px; the pane here is ~1200.
      expect(
        body.width,
        `prose is ${Math.round(body.width)}px inside a ${Math.round(pane.width)}px pane — capped again?`,
      ).toBeGreaterThan(900);

      // 2. Not centred. `mx-auto` would split the slack evenly and push the left
      //    edge well clear of the divider; tucked left keeps it at the padding.
      expect(
        body.x - pane.x,
        'prose is not hugging the divider — `mx-auto` back on the wrapper?',
      ).toBeLessThan(40);
    } finally {
      const del = await ownerApi.delete(`/api/pages/${row.id}`);
      expect(del.ok()).toBeTruthy();
    }
  });
});
