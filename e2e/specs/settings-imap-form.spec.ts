import { expect, test } from '../lib/fixtures';

/**
 * The IMAP form is the §6 bulk of Settings → Accounts, and the plan's table
 * missed it: it counted `accounts-client.tsx` (no `ui/field` imports at all)
 * and never opened `imap/imap-form.tsx`, which is 342 lines with a dozen raw
 * `<Label>`s beside their controls.
 *
 * What this holds is §6b — a failure lands ON THE CONTROL AT FAULT, not as a
 * red line at the foot of the form:
 *
 *   • `data-invalid` on the `<Field>`
 *   • `aria-invalid` on the control
 *   • `role="alert"` on the message, so it is announced
 *   • `aria-describedby` on the control pointing AT that message
 *
 * The form was `required` / `type="email"` / `min` / `max` before, which is a
 * browser bubble: it announces nothing, it vanishes on the next click, and it
 * cannot say which of a slug's rules broke. The rules here are unchanged — only
 * the delivery is.
 *
 * No account needed: `?mode=add` renders the same component in add mode, which
 * is the mode with the most required fields.
 */
test.describe('settings → accounts: the IMAP form', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('an empty submit fails on the controls, not at the foot of the form', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/accounts?mode=add');

    const address = ownerPage.locator('#address');
    await expect(address).toBeVisible();

    // Everything empty except the defaults the form ships with (port 993,
    // scan history 365) — so address, password and host are the failures.
    await ownerPage.getByRole('button', { name: /Connect & save/i }).click();

    for (const id of ['address', 'password', 'host']) {
      const control = ownerPage.locator(`#${id}`);
      await expect(control, `${id} is not marked invalid`).toHaveAttribute('aria-invalid', 'true');

      // The Field wrapping it carries the invalid state too — that is what
      // turns the label red, and it is the hook §6b names first.
      const field = ownerPage.locator(`[data-slot="field"]:has(#${id})`);
      await expect(field, `${id}'s Field has no data-invalid`).toHaveAttribute(
        'data-invalid',
        'true',
      );

      // aria-describedby must actually POINT AT the message, and that message
      // must be an alert. A description that names a missing node is worse than
      // none: the reader is told there is more to hear and then hears nothing.
      const described = (await control.getAttribute('aria-describedby')) ?? '';
      expect(described, `${id} does not describe its error`).toContain(`${id}-error`);
      const error = ownerPage.locator(`#${id}-error`);
      await expect(error).toBeVisible();
      await expect(error, `${id}'s error is not announced`).toHaveAttribute('role', 'alert');
      expect((await error.innerText()).trim().length).toBeGreaterThan(0);
    }

    // The caret goes to the first failure, so a keyboard user is not left
    // hunting for it.
    await expect(address).toBeFocused();

    // Nothing was sent. A form that fails validation and posts anyway is the
    // bug this whole section exists to stop.
    await expect(ownerPage).toHaveURL(/mode=add/);
  });

  test('typing in a bad field clears its error without touching the others', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/accounts?mode=add');
    await expect(ownerPage.locator('#address')).toBeVisible();
    await ownerPage.getByRole('button', { name: /Connect & save/i }).click();
    await expect(ownerPage.locator('#address')).toHaveAttribute('aria-invalid', 'true');

    await ownerPage.locator('#address').fill('someone@example.com');
    await expect(ownerPage.locator('#address')).not.toHaveAttribute('aria-invalid', 'true');
    // The others are still wrong and must still say so.
    await expect(ownerPage.locator('#host')).toHaveAttribute('aria-invalid', 'true');
  });

  test('a malformed address is caught, and so is an out-of-range port', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/accounts?mode=add');
    await expect(ownerPage.locator('#address')).toBeVisible();

    await ownerPage.locator('#address').fill('not-an-address');
    await ownerPage.locator('#host').fill('imap.example.com');
    await ownerPage.locator('#password').fill('app-password');
    await ownerPage.locator('#port').fill('99999');
    await ownerPage.getByRole('button', { name: /Connect & save/i }).click();

    await expect(ownerPage.locator('#address-error')).toContainText(/email address/i);
    await expect(ownerPage.locator('#port-error')).toContainText(/65535/);
  });
});
