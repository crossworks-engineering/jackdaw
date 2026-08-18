import { expect, test } from '../lib/fixtures';

/**
 * Tool groups, §6b. Two of the three failures this screen can produce used to
 * be delivered badly:
 *
 *   • name / slug leaned on `required` + `pattern`, so the browser raised its
 *     own bubble — announced to nothing, gone on the next click, and unable to
 *     say WHICH of the slug's rules broke.
 *   • the integration check was a TOAST. It named a control, appeared in a
 *     corner, and vanished before you could look for it.
 *
 * All three land on their control now. No seeding: "New" opens the editor in
 * create mode, which is the mode with every required field in it.
 */
test.describe('settings → tool groups', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  const openCreate = async (page: import('@playwright/test').Page) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/settings/tool-groups');
    await page.getByRole('button', { name: /^New$/ }).click();
    await expect(page.locator('#name')).toBeVisible();
  };

  test('an empty submit marks name and slug, not the foot of the form', async ({ ownerPage }) => {
    await openCreate(ownerPage);
    await ownerPage.getByRole('button', { name: /Create group/i }).click();

    for (const id of ['name', 'slug']) {
      const control = ownerPage.locator(`#${id}`);
      await expect(control, `${id} is not marked invalid`).toHaveAttribute('aria-invalid', 'true');
      await expect(
        ownerPage.locator(`[data-slot="field"]:has(#${id})`),
        `${id}'s Field has no data-invalid`,
      ).toHaveAttribute('data-invalid', 'true');
      const error = ownerPage.locator(`#${id}-error`);
      await expect(error).toBeVisible();
      await expect(error, `${id}'s error is not announced`).toHaveAttribute('role', 'alert');
      expect((await control.getAttribute('aria-describedby')) ?? '').toContain(`${id}-error`);
    }
    await expect(ownerPage.locator('#name')).toBeFocused();
  });

  test('a malformed slug says which rule it broke', async ({ ownerPage }) => {
    await openCreate(ownerPage);
    await ownerPage.locator('#name').fill('Weather tools');
    await ownerPage.locator('#slug').fill('Not A Slug');
    await ownerPage.getByRole('button', { name: /Create group/i }).click();

    await expect(ownerPage.locator('#slug-error')).toContainText(/lower-case/i);
    await expect(ownerPage.locator('#slug-error')).toHaveAttribute('role', 'alert');
    // The name was fine, so it must NOT be marked.
    await expect(ownerPage.locator('#name')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('an integration with no service fails under the field, not in a toast', async ({
    ownerApi,
    ownerPage,
  }) => {
    // ⚠ EDIT mode only. `ToolGroupIntegrationSection` is not rendered while
    // creating — a new group starts unbound and is edited into an integration,
    // so create mode shows an explainer where the section will be. A version of
    // this test that opened "New" found no switch and timed out.
    const name = `E2E tools ${Date.now()}`;
    const slug = `e2e-tools-${Date.now()}`;
    const created = await ownerApi.post('/api/tool-groups', {
      data: { name, slug, description: '', toolSlugs: [], enabled: true },
    });
    expect(created.ok(), 'could not seed a tool group').toBeTruthy();
    const body = (await created.json()) as { group?: { id: string }; id?: string };
    const id = body.group?.id ?? body.id;
    expect(id, 'the create response carried no id').toBeTruthy();

    try {
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/settings/tool-groups?selected=${id}`);
      await expect(ownerPage.locator('#name')).toHaveValue(name);

      await ownerPage.getByRole('switch', { name: 'This group is an API integration' }).click();
      const service = ownerPage.locator('#integration-service');
      await expect(service).toBeVisible();
      await expect(service).toHaveValue('');

      await ownerPage.getByRole('button', { name: /Save group/i }).click();

      await expect(service, 'the service control is not marked').toHaveAttribute(
        'aria-invalid',
        'true',
      );
      const error = ownerPage.locator('#integration-service-error');
      await expect(error, 'the message is still a toast, not a field error').toBeVisible();
      await expect(error).toHaveAttribute('role', 'alert');
      expect((await service.getAttribute('aria-describedby')) ?? '').toContain(
        'integration-service-error',
      );
    } finally {
      const del = await ownerApi.delete(`/api/tool-groups/${id}`);
      expect(del.ok()).toBeTruthy();
    }
  });
});
