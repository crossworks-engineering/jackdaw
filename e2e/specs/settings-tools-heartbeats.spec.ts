import { expect, test } from '../lib/fixtures';

/**
 * `tools` and `heartbeats`, §6b. Between them they had EIGHT toasts carrying a
 * message about one control — and five of those carry a PARSER error you can
 * only judge against the JSON you just typed, which is the worst possible thing
 * to put in a corner that clears itself.
 *
 * Both screens now put every one of them under the control that produced it,
 * parser text intact.
 */
test.describe('settings → tools', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('an empty submit marks every required control at once', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/tools');
    await ownerPage.getByRole('button', { name: /^New$/ }).click();
    await expect(ownerPage.locator('#name')).toBeVisible();

    await ownerPage.getByRole('button', { name: /Create tool/i }).click();

    for (const id of ['name', 'slug', 'description', 'url']) {
      const control = ownerPage.locator(`#${id}`);
      await expect(control, `${id} is not marked invalid`).toHaveAttribute('aria-invalid', 'true');
      await expect(
        ownerPage.locator(`[data-slot="field"]:has(#${id})`),
        `${id}'s Field has no data-invalid`,
      ).toHaveAttribute('data-invalid', 'true');
      const error = ownerPage.locator(`#${id}-error`);
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute('role', 'alert');
    }
    await expect(ownerPage.locator('#name')).toBeFocused();
  });

  test('a bad input schema keeps its parser message, on the textarea', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/tools');
    await ownerPage.getByRole('button', { name: /^New$/ }).click();
    await ownerPage.locator('#schema').fill('{ not json');
    await ownerPage.getByRole('button', { name: /Create tool/i }).click();

    const error = ownerPage.locator('#schema-error');
    await expect(error).toBeVisible();
    await expect(error, 'the parser message was dropped').toContainText(/invalid json/i);
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(ownerPage.locator('#schema')).toHaveAttribute('aria-invalid', 'true');
  });

  test('a fixed field stops complaining without another submit', async ({ ownerPage }) => {
    // The screen revalidates on change once a submit has failed, so an error
    // cannot outlive its cause.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/tools');
    await ownerPage.getByRole('button', { name: /^New$/ }).click();
    await ownerPage.getByRole('button', { name: /Create tool/i }).click();
    await expect(ownerPage.locator('#name')).toHaveAttribute('aria-invalid', 'true');

    await ownerPage.locator('#name').fill('Weather lookup');
    await expect(ownerPage.locator('#name')).not.toHaveAttribute('aria-invalid', 'true');
    // The others are still wrong and must still say so.
    await expect(ownerPage.locator('#description')).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('settings → heartbeats', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('an unparseable initial state fails on the textarea, not in a toast', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/heartbeats');
    await ownerPage.getByRole('button', { name: /^New$/ }).click();

    // ⚠ A new heartbeat defaults to the TELEGRAM surface with a blank chat_id,
    // and that check runs before the state parse — so without this the submit
    // returns early and the state error never renders. (A first version of this
    // test missed it and failed for the wrong reason.)
    await ownerPage.locator('#hb_chat_id').fill('12345');

    const state = ownerPage.locator('#state_text');
    await expect(state).toBeVisible();
    await state.fill('{ not json');
    await ownerPage.getByRole('button', { name: /^Create$/ }).click();

    const error = ownerPage.locator('#state_text-error');
    await expect(error).toBeVisible();
    await expect(error, 'the parser message was dropped').toContainText(/invalid json/i);
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(state).toHaveAttribute('aria-invalid', 'true');
    await expect(
      ownerPage.locator('[data-slot="field"]:has(#state_text)'),
      'the Field carries no data-invalid, so the label never reddens',
    ).toHaveAttribute('data-invalid', 'true');
  });

  test('an interval below 1 minute is refused on the control', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/heartbeats');
    await ownerPage.getByRole('button', { name: /^New$/ }).click();

    // `interval` is the default schedule kind, so the field is already there.
    const every = ownerPage.locator('#hb_every');
    await expect(every).toBeVisible();
    await every.fill('0');
    await ownerPage.getByRole('button', { name: /^Create$/ }).click();

    await expect(every).toHaveAttribute('aria-invalid', 'true');
    await expect(ownerPage.locator('#hb_every-error')).toContainText(/1 or more/i);
    await expect(ownerPage.locator('#hb_every-error')).toHaveAttribute('role', 'alert');
  });

  test('the default Telegram surface demands its chat_id, on the control', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/heartbeats');
    await ownerPage.getByRole('button', { name: /^New$/ }).click();

    const chat = ownerPage.locator('#hb_chat_id');
    await expect(chat).toBeVisible();
    await expect(chat, 'a new heartbeat should start with a blank chat_id').toHaveValue('');
    await ownerPage.getByRole('button', { name: /^Create$/ }).click();

    await expect(chat).toHaveAttribute('aria-invalid', 'true');
    await expect(ownerPage.locator('#hb_chat_id-error')).toContainText(/chat_id/i);
    await expect(ownerPage.locator('#hb_chat_id-error')).toHaveAttribute('role', 'alert');
  });
});
