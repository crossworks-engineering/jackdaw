import { expect, test } from '../lib/fixtures';

/**
 * Worker groups is the first of the settings cluster onto the `Field` family,
 * so this holds the §6b contract the rest of the cluster will copy: a failure
 * lands on the control at fault, announced, and pointed at by the control's own
 * `aria-describedby`.
 *
 * It seeds its own group. The scratch brain has none — no groups AND no worker
 * agents — so without this the detail form never renders and the spec would
 * grade an empty screen.
 */
test.describe('settings → worker groups', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('a blank name fails on the control, not at the foot of the form', async ({
    ownerApi,
    ownerPage,
  }) => {
    const name = `E2E group ${Date.now()}`;
    const slug = `e2e-group-${Date.now()}`;
    const created = await ownerApi.post('/api/settings/worker-groups', { data: { slug, name } });
    expect(created.ok(), 'could not seed a worker group').toBeTruthy();
    const { group } = (await created.json()) as { group: { id: string } };

    try {
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto('/settings/worker-groups');
      await ownerPage.getByText(name).first().click();

      const control = ownerPage.locator('#wg-name');
      await expect(control).toBeVisible();
      await expect(control).toHaveValue(name);

      await control.fill('');
      await ownerPage.getByRole('button', { name: /Save worker group/i }).click();

      await expect(control, 'the control is not marked invalid').toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(
        ownerPage.locator('[data-slot="field"]:has(#wg-name)'),
        'the Field carries no data-invalid, so the label never reddens',
      ).toHaveAttribute('data-invalid', 'true');

      const error = ownerPage.locator('#wg-name-error');
      await expect(error).toBeVisible();
      await expect(error, 'the message is not announced').toHaveAttribute('role', 'alert');
      expect((await control.getAttribute('aria-describedby')) ?? '').toContain('wg-name-error');

      // Typing clears it again — an error that outlives its cause is its own bug.
      await control.fill('Renamed by e2e');
      await expect(control).not.toHaveAttribute('aria-invalid', 'true');
    } finally {
      const del = await ownerApi.delete(`/api/settings/worker-groups/${group.id}`);
      expect(del.ok()).toBeTruthy();
    }
  });

  test('the create dialog validates the slug it used to leave to the browser', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/worker-groups');
    await ownerPage.getByRole('button', { name: /^New$/ }).click();

    const slug = ownerPage.locator('#wg-new-slug');
    await expect(slug).toBeVisible();

    // `pattern="[a-z0-9_\-]+"` used to raise a browser bubble that could not say
    // WHICH rule broke. Now the message names it.
    await ownerPage.locator('#wg-new-name').fill('Has Capitals');
    await slug.fill('Not A Slug');
    await ownerPage.getByRole('button', { name: /Create worker group/i }).click();

    await expect(slug).toHaveAttribute('aria-invalid', 'true');
    await expect(ownerPage.locator('#wg-new-slug-error')).toContainText(/lower-case/i);
    await expect(ownerPage.locator('#wg-new-slug-error')).toHaveAttribute('role', 'alert');
  });
});
