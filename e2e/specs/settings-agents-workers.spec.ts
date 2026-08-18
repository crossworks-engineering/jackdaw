import { expect, test } from '../lib/fixtures';

/**
 * `agents` and `ai-workers`, §6b — the last two settings screens, and the two
 * biggest forms in the app (34 and 38 labelled controls).
 *
 * What was replaced is not a missing rule but a bad DELIVERY of an existing one:
 *
 * - `agents` ran `checkValidity()` and then `reportValidity()` on the first
 *   invalid control. Its fields live on CSS-hidden tabs, so the browser gave up
 *   silently more often than it spoke, and when it did speak it was a bubble
 *   announced to nothing that vanished on the next click.
 * - `ai-workers` leaned on plain `required`, and on `model` it never fired at
 *   all: `ModelSelect`'s trigger is a button, not a form control.
 *
 * ⚠ Both screens are EMPTY on the scratch brain, so every test here drives
 * CREATE mode — which renders the same form with every required field.
 */

/** The panes are a CSS grid until `useMediaQuery` resolves, then a different
 *  tree of resizable panels. Touching the list before that swap is racing a
 *  remount: green alone, red under a full run. The handle exists only in the
 *  panel branch. */
async function panelsReady(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-slot="resizable-handle"]').first()).toBeVisible();
}

test.describe('settings → agents', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('an empty submit marks every required control, on the field', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/agents');
    await panelsReady(ownerPage);
    await ownerPage.getByRole('button', { name: /^New$/ }).click();
    await expect(ownerPage.locator('#name')).toBeVisible();

    // Name and slug are blank on a new agent. (The API key is unpicked too, but
    // it lives on another tab — the test below covers that half.) Model carries
    // a role default, so it is deliberately not in this list.
    await ownerPage.getByRole('button', { name: /Create agent/i }).click();

    for (const id of ['name', 'slug']) {
      const control = ownerPage.locator(`#${id}`);
      await expect(control, `${id} is not marked invalid`).toHaveAttribute('aria-invalid', 'true');
      await expect(
        ownerPage.locator(`[data-slot="field"]:has(#${id})`),
        `${id}'s Field has no data-invalid`,
      ).toHaveAttribute('data-invalid', 'true');
      const error = ownerPage.locator(`#${id}-error`);
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute('role', 'alert');
      expect(
        (await control.getAttribute('aria-describedby'))?.split(/\s+/),
        `${id} does not point at its own error text`,
      ).toContain(`${id}-error`);
    }
    // Focus lands on the FIRST thing wrong, in form order.
    await expect(ownerPage.locator('#name')).toBeFocused();
  });

  test('a fixed field stops complaining without another submit', async ({ ownerPage }) => {
    // The screen revalidates on change once a submit has failed, so an error
    // cannot outlive its cause — with no per-field wiring on 34 controls.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/agents');
    await panelsReady(ownerPage);
    await ownerPage.getByRole('button', { name: /^New$/ }).click();
    await ownerPage.getByRole('button', { name: /Create agent/i }).click();
    await expect(ownerPage.locator('#name')).toHaveAttribute('aria-invalid', 'true');

    // Typing a name also fills the slug (it is derived until touched), so both
    // marks lift on one edit.
    await ownerPage.locator('#name').fill('Telegram responder');
    await expect(ownerPage.locator('#name')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(ownerPage.locator('#slug')).not.toHaveAttribute('aria-invalid', 'true');
    // What is still wrong must still say so — the API key, over on the
    // Model & routing tab.
    await expect(ownerPage.locator('#apiKey')).toHaveAttribute('aria-invalid', 'true');
  });

  test('an unpicked API key marks its control on the tab that holds it', async ({ ownerPage }) => {
    // Provider, key and model are on "Model & routing". Fill in what General
    // wants, and the next submit has to move the user to the tab that still
    // has something wrong rather than looking inert.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/agents');
    await panelsReady(ownerPage);
    await ownerPage.getByRole('button', { name: /^New$/ }).click();
    await ownerPage.locator('#name').fill('Telegram responder');
    await ownerPage.getByRole('button', { name: /Create agent/i }).click();

    await expect(ownerPage.getByRole('tab', { name: 'Model & routing' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const key = ownerPage.locator('#apiKey');
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    await expect(key).toBeFocused();
    const error = ownerPage.locator('#apiKey-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    expect((await key.getAttribute('aria-describedby'))?.split(/\s+/)).toContain('apiKey-error');
  });

  test('a bad slug says WHICH rule broke', async ({ ownerPage }) => {
    // The old delivery could not: a `pattern` bubble reads "Please match the
    // requested format", and the format is nowhere on screen.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/agents');
    await panelsReady(ownerPage);
    await ownerPage.getByRole('button', { name: /^New$/ }).click();
    await ownerPage.locator('#slug').fill('Not A Slug');
    await ownerPage.getByRole('button', { name: /Create agent/i }).click();

    await expect(ownerPage.locator('#slug-error')).toContainText(/lower-case/i);
  });

  test('a rule on a hidden tab pulls its tab forward', async ({ ownerApi, ownerPage }) => {
    // The whole reason the browser could not do this job: the system prompt
    // lives on the Behaviour tab, and a `display:none` control can neither take
    // focus nor show a bubble — the old submit simply looked inert.
    //
    // Reaching it needs a saved key, and the scratch brain has none, so seed one
    // (a fake string; nothing calls it) and take it away again afterwards.
    const created = await ownerApi.post('/api/keys', {
      data: { service: 'openrouter', label: 'e2e-agents', plaintext: 'sk-e2e-not-a-real-key' },
    });
    expect(created.status(), 'could not seed the fixture key').toBeLessThan(300);
    const { key } = (await created.json()) as { key?: { id: string } };
    try {
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto('/settings/agents');
      await panelsReady(ownerPage);
      await ownerPage.getByRole('button', { name: /^New$/ }).click();
      await ownerPage.locator('#name').fill('Telegram responder');

      await ownerPage.getByRole('tab', { name: 'Model & routing' }).click();
      await ownerPage.locator('#apiKey').click();
      await ownerPage.getByRole('option', { name: /e2e-agents/ }).click();
      await expect(ownerPage.locator('#apiKey')).toContainText('e2e-agents');

      await ownerPage.getByRole('tab', { name: 'Behaviour' }).click();
      await ownerPage.locator('#systemPrompt').fill('');
      await ownerPage.getByRole('tab', { name: 'General' }).click();
      await expect(ownerPage.locator('#name')).toBeVisible();

      await ownerPage.getByRole('button', { name: /Create agent/i }).click();

      // Back on Behaviour, with the message on the control.
      await expect(ownerPage.getByRole('tab', { name: 'Behaviour' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(ownerPage.locator('#systemPrompt')).toBeFocused();
      await expect(ownerPage.locator('#systemPrompt-error')).toBeVisible();
    } finally {
      if (key?.id) await ownerApi.delete(`/api/keys/${key.id}`);
    }
  });
});

test.describe('settings → ai-workers', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('an empty submit marks name and model, on the field', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/ai-workers');
    await panelsReady(ownerPage);
    // Each kind has its own "+ Add"; the first one is enough to render the form.
    await ownerPage.getByRole('button', { name: /^Add$/ }).first().click();
    await expect(ownerPage.locator('#name')).toBeVisible();

    await ownerPage.getByRole('button', { name: /Create worker/i }).click();

    for (const id of ['name', 'model']) {
      await expect(ownerPage.locator(`#${id}`), `${id} is not marked invalid`).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      const error = ownerPage.locator(`#${id}-error`);
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute('role', 'alert');
    }
    await expect(ownerPage.locator('#name')).toBeFocused();
  });

  test('one form-level handler clears a fixed field', async ({ ownerPage }) => {
    // This form is UNCONTROLLED (name + defaultValue, read as FormData), so the
    // revalidation hangs off the form's own change event rather than 38 inputs.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/ai-workers');
    await panelsReady(ownerPage);
    await ownerPage.getByRole('button', { name: /^Add$/ }).first().click();
    await ownerPage.getByRole('button', { name: /Create worker/i }).click();
    await expect(ownerPage.locator('#name')).toHaveAttribute('aria-invalid', 'true');

    await ownerPage.locator('#name').fill("Saskia's voice");
    await expect(ownerPage.locator('#name')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(ownerPage.locator('#model')).toHaveAttribute('aria-invalid', 'true');
  });
});
