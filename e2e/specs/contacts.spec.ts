import { expect, test } from '../lib/fixtures';
import { ARTIFACTS_DIR } from '../lib/env';

/**
 * `/contacts`, ported to the Tasks standard (phase 2a).
 *
 * Contacts is a different shape from Events on purpose: there is no read view,
 * the detail pane IS the form, and its boolean flag lives in the header as a
 * Switch (the settings-editor convention §8 keeps). So this pins the parts of
 * the standard that survive that shape — the `<MasterDetail>` scaffold, the §8
 * header, and §6b reaching a repeating field group.
 */

test.describe('contacts', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('master-detail scaffold, §8 header, and the Save verb+noun label', async ({
    ownerApi,
    ownerPage,
  }) => {
    const marker = `E2E contact ${Date.now()}`;
    const created = await ownerApi.post('/api/contacts', {
      data: { first_name: 'E2E', last_name: marker },
    });
    expect(created.ok()).toBeTruthy();
    const body = (await created.json()) as { contact?: { id?: string }; id?: string };
    const id = body.contact?.id ?? body.id;
    expect(id).toBeTruthy();

    try {
      await ownerPage.goto(`/contacts?id=${id}`);
      const list = ownerPage.locator('[data-testid="list"]');
      const detail = ownerPage.locator('[data-testid="detail"]');
      await expect(list).toBeVisible();
      await expect(detail).toBeVisible();

      // §8: the glyph is INSIDE the h2, and delete is an icon-only ghost with an
      // aria-label — it used to carry a "Delete" text label.
      const heading = detail.getByRole('heading', { level: 2 });
      await expect(heading).toContainText(marker);
      await expect(heading.locator('svg')).toHaveCount(1);
      const del = detail.getByRole('button', { name: 'Delete contact' });
      await expect(del).toBeVisible();
      await expect(del).toHaveText('');

      // The header flag stays a Switch (settings-editor convention).
      await expect(detail.getByRole('switch', { name: /Team member/ })).toBeVisible();

      // §6: verb + noun, and no text-swap to "Saving…" while in flight.
      await expect(detail.getByRole('button', { name: 'Save contact' })).toBeVisible();
      await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}contacts-master-detail.png` });
    } finally {
      await ownerApi.delete(`/api/contacts/${id}`);
    }
  });

  test('a malformed email address is announced, not just outlined', async ({
    ownerApi,
    ownerPage,
  }) => {
    // The red border was the only signal, which a screen reader never received.
    // §6b: `aria-invalid` on the control plus a `role="alert"` it points at.
    const marker = `E2E contact email ${Date.now()}`;
    const created = await ownerApi.post('/api/contacts', {
      data: { first_name: 'E2E', last_name: marker },
    });
    const body = (await created.json()) as { contact?: { id?: string }; id?: string };
    const id = body.contact?.id ?? body.id;

    try {
      await ownerPage.goto(`/contacts?id=${id}`);
      const detail = ownerPage.locator('[data-testid="detail"]');
      const email = detail.getByPlaceholder('orders@modular.co.za');
      await expect(email).toBeVisible();
      await expect(email).not.toHaveAttribute('aria-invalid', 'true');
      await expect(detail.getByRole('alert')).toHaveCount(0);

      await email.fill('not an address');
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      const alert = detail.getByRole('alert');
      await expect(alert).toContainText(/full address or a leading-@ domain/i);
      const describedBy = await email.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      await expect(detail.locator(`#${describedBy}`)).toContainText(/full address/i);

      // A plausible address clears both halves together.
      await email.fill('orders@example.com');
      await expect(email).not.toHaveAttribute('aria-invalid', 'true');
      await expect(detail.getByRole('alert')).toHaveCount(0);
      await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}contacts-email-invalid.png` });
    } finally {
      await ownerApi.delete(`/api/contacts/${id}`);
    }
  });
});
