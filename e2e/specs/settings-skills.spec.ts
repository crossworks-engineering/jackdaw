import { expect, test } from '../lib/fixtures';

/**
 * Skills, §6b. The interesting one here is the default-state JSON.
 *
 * Its two failures were toasts, under a comment claiming they surfaced
 * "inline". They did not — and this is the worst field in the cluster to do
 * that to: the message carries a PARSER error you have to read against the text
 * you just typed, and a toast takes it away while you are still looking at the
 * textarea. It belongs under the control.
 */
test.describe('settings → skills', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  const openCreate = async (page: import('@playwright/test').Page) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/settings/skills');
    await page.getByRole('button', { name: /^New$/ }).click();
    await expect(page.locator('#name')).toBeVisible();
  };

  test('an empty submit marks name, slug and description', async ({ ownerPage }) => {
    await openCreate(ownerPage);
    await ownerPage.getByRole('button', { name: /Create skill/i }).click();

    for (const id of ['name', 'slug', 'description']) {
      const control = ownerPage.locator(`#${id}`);
      await expect(control, `${id} is not marked invalid`).toHaveAttribute('aria-invalid', 'true');
      await expect(
        ownerPage.locator(`[data-slot="field"]:has(#${id})`),
        `${id}'s Field has no data-invalid`,
      ).toHaveAttribute('data-invalid', 'true');
      const error = ownerPage.locator(`#${id}-error`);
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute('role', 'alert');
      expect((await control.getAttribute('aria-describedby')) ?? '').toContain(`${id}-error`);
    }
    await expect(ownerPage.locator('#name')).toBeFocused();
  });

  test('unparseable default state fails on the textarea and keeps the parser message', async ({
    ownerPage,
  }) => {
    await openCreate(ownerPage);
    await ownerPage.locator('#name').fill('Inbox triage');
    await ownerPage.locator('#slug').fill('inbox-triage');
    await ownerPage.locator('#description').fill('Triage an inbox and draft replies.');
    await ownerPage.locator('#defaultState').fill('{ not json');
    await ownerPage.getByRole('button', { name: /Create skill/i }).click();

    const control = ownerPage.locator('#defaultState');
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    const error = ownerPage.locator('#defaultState-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error, 'the parser message was dropped').toContainText(/invalid json/i);
    expect((await control.getAttribute('aria-describedby')) ?? '').toContain('defaultState-error');
    await expect(control).toBeFocused();
  });

  test('valid JSON that is not an OBJECT is refused too', async ({ ownerPage }) => {
    await openCreate(ownerPage);
    await ownerPage.locator('#name').fill('Inbox triage');
    await ownerPage.locator('#slug').fill('inbox-triage');
    await ownerPage.locator('#description').fill('Triage an inbox and draft replies.');
    // Parses fine — but a heartbeat's state is an object, not a list.
    await ownerPage.locator('#defaultState').fill('[1, 2, 3]');
    await ownerPage.getByRole('button', { name: /Create skill/i }).click();

    await expect(ownerPage.locator('#defaultState-error')).toContainText(/JSON object/i);
  });
});
