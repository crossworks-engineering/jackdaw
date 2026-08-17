import { expect, test } from '../lib/fixtures';
import { ARTIFACTS_DIR } from '../lib/env';

/**
 * `/journal`, ported to the Tasks standard (phase 2a).
 *
 * The headline here is not the scaffold — it is that **saving worked at all**.
 * The editor posted with a bare `fetch('/api/journal')`, which on the detached
 * topology goes to the CLIENT origin; that origin has no `/api` routes, so every
 * save was redirected to `/login` and silently lost. It was the last raw
 * `fetch('/api/…')` left in the client. The round-trip below is the regression
 * test for it, and it is the first spec in the suite that would have caught it.
 */

test.describe('journal', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('a new entry saves to the BRAIN and comes back in the list', async ({
    ownerApi,
    ownerPage,
  }) => {
    const marker = `E2E journal ${Date.now()}`;
    let id: string | null = null;

    try {
      await ownerPage.goto('/journal');
      const detail = ownerPage.locator('[data-testid="detail"]');
      await ownerPage.locator('[data-testid="list"]').getByRole('button', { name: 'New' }).click();

      const body = detail.getByPlaceholder(/A short, honest note/);
      await expect(body).toBeVisible();

      // Empty body → §6b on the control, not a toast that scrolls away.
      await detail.getByRole('button', { name: 'Save journal entry' }).click();
      await expect(detail.getByRole('alert')).toHaveText('Write something first');
      await expect(body).toHaveAttribute('aria-invalid', 'true');

      await detail.getByLabel('Journal entry title').fill(marker);
      await body.fill(`${marker} — the body of the entry.`);
      await detail.getByRole('button', { name: 'Save journal entry' }).click();

      // Back to the read view, and the row is in the list.
      await expect(detail.getByRole('heading', { name: new RegExp(marker) })).toBeVisible();
      await expect(
        ownerPage.locator(`[data-mark-kind="journal"][data-mark-label="${marker}"]`),
      ).toBeVisible();

      // And it is really on the brain — the half a client-origin POST could
      // never reach.
      const listed = await ownerApi.get(`/api/journal?q=${encodeURIComponent(marker)}`);
      expect(listed.ok()).toBeTruthy();
      const { journals } = (await listed.json()) as { journals: { id: string; title: string }[] };
      const row = journals.find((j) => j.title === marker);
      expect(row, 'the entry never reached the brain').toBeTruthy();
      id = row!.id;
      await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}journal-saved.png` });
    } finally {
      if (id) await ownerApi.delete(`/api/journal/${id}`);
    }
  });

  test('master-detail scaffold, one scrollbar, §8 header', async ({ ownerApi, ownerPage }) => {
    const marker = `E2E journal panes ${Date.now()}`;
    const created = await ownerApi.post('/api/journal', {
      data: { title: marker, body: 'x\n'.repeat(400), mood: 'good' },
    });
    expect(created.ok()).toBeTruthy();
    const { journal } = (await created.json()) as { journal: { id: string } };

    try {
      await ownerPage.goto(`/journal?q=${encodeURIComponent(marker)}`);
      const list = ownerPage.locator('[data-testid="list"]');
      const detail = ownerPage.locator('[data-testid="detail"]');
      await expect(list).toBeVisible();
      await expect(detail).toBeVisible();

      // §8: glyph inside the h2, title truncates, delete icon-only.
      const heading = detail.getByRole('heading', { level: 2 });
      await expect(heading).toContainText(marker);
      const del = detail.getByRole('button', { name: 'Delete journal entry' });
      await expect(del).toHaveText('');

      // ONE scroller, and it is MasterDetail's own. The preview used to nest a
      // second one inside it, which paints two bars and sticks the header to the
      // inner one. A long body is what makes the difference visible.
      //
      // Counted rather than located: MasterDetail's scroller sits a couple of
      // wrappers down (the panel library adds its own), so "which element" is an
      // implementation detail. "How many bars the user sees" is not.
      const scrollers = await detail.evaluate(
        (pane) =>
          Array.from(pane.querySelectorAll('*')).filter((el) => {
            const s = getComputedStyle(el);
            return (
              (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight
            );
          }).length,
      );
      expect(scrollers, 'a long entry should scroll in ONE place, not two').toBe(1);
      await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}journal-master-detail.png` });
    } finally {
      await ownerApi.delete(`/api/journal/${journal.id}`);
    }
  });
});
