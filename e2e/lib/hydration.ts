import { expect, type Locator } from '@playwright/test';

/**
 * Click a control and wait for what it opens, RETRYING the click.
 *
 * The owner UI's screens are client components that still server-render, so a
 * button is in the DOM — present, stable, enabled, and by every measure
 * Playwright takes, actionable — a beat before React hydrates and attaches its
 * `onClick`. Playwright clicks as soon as a control is actionable, so a
 * `goto()` followed straight by `click()` can land on markup that has no
 * listener yet. Nothing happens. No error, no bubble: the click is simply
 * swallowed, and the next assertion times out somewhere else entirely, blaming
 * the form it was about to fill in.
 *
 * That race is why six specs across skills, tool groups and worker groups
 * failed while `settings-tools-heartbeats.spec.ts` — the same shape, on the
 * same scaffold — passed: those screens simply hydrated before the click
 * landed. It is also why one of them passed once in six runs. A race reads as
 * a flake, and a flake reads as noise, which is how it survived.
 *
 * Retrying the click until the thing it opens appears is the honest wait. It
 * costs nothing on an already-hydrated page (the first click works and the
 * assertion exits), it needs no invented `waitForTimeout`, and unlike waiting
 * on a spinner it makes no assumption about what the screen renders while it
 * loads.
 *
 * ⚠️ Only for triggers whose action is IDEMPOTENT — "New" opening a create
 * form, a tab, a disclosure. Never for something that submits, deletes or
 * appends, where a swallowed first click and a real second one are not the
 * same as one click.
 */
export async function clickUntilOpen(
  trigger: Locator,
  opened: Locator,
  { timeout = 15_000 }: { timeout?: number } = {},
) {
  await expect(async () => {
    await trigger.click();
    await expect(opened).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout });
}
