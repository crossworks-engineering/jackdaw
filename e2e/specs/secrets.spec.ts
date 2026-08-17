import { expect, test } from '../lib/fixtures';
import { ARTIFACTS_DIR } from '../lib/env';

/**
 * `/secrets`, ported to the Tasks standard (phase 2a).
 *
 * Nothing here decrypts anything — reveal is its own concern and the API owns
 * it. What is pinned is the port: the scaffold, the boxed composer shared by
 * create and edit, the §8 header, and that the two raw `<select>`s (list filter
 * and Kind) are now real Selects.
 */

test.describe('secrets', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('scaffold, boxed composer, and both filters are real Selects', async ({ ownerPage }) => {
    await ownerPage.goto('/secrets');
    const list = ownerPage.locator('[data-testid="list"]');
    const detail = ownerPage.locator('[data-testid="detail"]');
    await expect(list).toBeVisible();
    await expect(detail).toBeVisible();

    // The list's kind filter — was a native `<select>`, so `combobox` is itself
    // the assertion that it is the kit's now.
    const kindFilter = list.getByRole('combobox', { name: 'Filter by kind' });
    await expect(kindFilter).toHaveText('All');
    await kindFilter.click();
    await ownerPage.getByRole('option', { name: 'token' }).click();
    await expect(ownerPage).toHaveURL(/kind=token/);

    // The composer: boxed card hugging the pane's leading edge (§6c).
    await list.getByRole('button', { name: 'New' }).click();
    await expect(detail.getByRole('heading', { name: 'New secret' })).toBeVisible();
    const card = detail.locator('div.rounded-lg.border.bg-card').first();
    const paneBox = (await detail.boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    const leftGap = cardBox.x - paneBox.x;
    const rightGap = paneBox.x + paneBox.width - (cardBox.x + cardBox.width);
    expect(leftGap).toBeLessThan(40);
    expect(Math.abs(leftGap - rightGap), 'still centred, not left-aligned').toBeLessThan(8);

    // The form's Kind control, also formerly a native `<select>`.
    await expect(detail.getByRole('combobox', { name: 'Kind' })).toBeVisible();

    // §6b: the title failure is on the title, not a loose red <p>.
    await detail.getByRole('button', { name: 'Save secret' }).click();
    await expect(detail.getByRole('alert')).toHaveText('Title is required');
    await expect(detail.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
    await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}secrets-composer.png` });
  });

  test('detail header follows §8, and edit reuses the same boxed form', async ({
    ownerApi,
    ownerPage,
  }) => {
    const marker = `E2E secret ${Date.now()}`;
    const created = await ownerApi.post('/api/secrets', {
      data: {
        title: marker,
        description: 'an e2e fixture',
        kind: 'token',
        tags: ['e2e'],
        note: 'sealed note',
        fields: [{ label: 'username', value: 'someone' }],
      },
    });
    expect(created.status()).toBe(201);
    const { secret } = (await created.json()) as { secret: { id: string } };

    try {
      await ownerPage.goto(`/secrets?q=${encodeURIComponent(marker)}`);
      const detail = ownerPage.locator('[data-testid="detail"]');
      const heading = detail.getByRole('heading', { level: 2 });
      await expect(heading).toContainText(marker);
      // Glyph inside the h2, and the kind badge rides inline with the title.
      await expect(heading.locator('svg')).toHaveCount(1);
      await expect(heading).toContainText('token');

      // Delete is icon-only and last (§8) — it carried a "Delete" label before.
      const edit = detail.getByRole('button', { name: 'Edit' });
      const del = detail.getByRole('button', { name: 'Delete secret' });
      await expect(del).toHaveText('');
      expect((await del.boundingBox())!.x).toBeGreaterThan((await edit.boundingBox())!.x);

      // Edit is the same boxed composer as create, not a bare form.
      await edit.click();
      await expect(detail.getByRole('heading', { name: 'Edit secret' })).toBeVisible();
      await expect(detail.locator('div.rounded-lg.border.bg-card').first()).toBeVisible();
      await expect(detail.getByRole('combobox', { name: 'Kind' })).toHaveText('token');
      await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}secrets-edit.png` });
    } finally {
      await ownerApi.delete(`/api/secrets/${secret.id}`);
    }
  });
});
