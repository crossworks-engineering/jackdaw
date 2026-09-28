import { expect, test } from '@playwright/test';
import {
  FILE_ID,
  PAGE_ID,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

const TYPED = ' Typed then left.';

/**
 * A member types in a page in Mine and leaves inside the autosave debounce
 * (800 ms) by reloading the tab: the typing must survive. A reload (like a
 * tab close) fires no blur and unmounts nothing, so only the leave flush
 * (pagehide / visibilitychange, useFlushOnLeave) can save it; before the
 * member editors had one, those words were gone. Runs against the in-memory
 * member API (mock-member-api.ts), no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

test('typing in a Mine page, then leaving within the debounce, is kept', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAsMember(context, baseURL!);

  await page.goto(`/pages?id=${PAGE_ID}`);
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('Start.', { timeout: 60_000 });

  // Type at the end of the first paragraph, then leave at once.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(TYPED);
  const typedAt = Date.now();
  const left = page.reload();
  // The scenario only means something inside the debounce window.
  expect(Date.now() - typedAt).toBeLessThan(800);
  await left;

  // Come back to it: the text is there, because it reached the brain.
  await expect(page.locator('.ProseMirror')).toContainText(`Start.${TYPED}`, {
    timeout: 60_000,
  });
  expect(JSON.stringify(api.draft)).toContain(TYPED.trim());

  // A member's editor never calls the admin routes that refuse members; the
  // page's image loads from the member route instead.
  expect(api.adminCalls).toEqual([]);
  expect(api.memberAssetCalls).toContain(`/api/member/files/${FILE_ID}`);
});

test('a write the brain keeps refusing says so, keeps the typing and asks before leaving', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAsMember(context, baseURL!);
  api.failDrafts = 500;

  await page.goto(`/pages?id=${PAGE_ID}`);
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('Start.', { timeout: 60_000 });
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Refused words.');

  // Two 500s in a row (the debounce, then one retry): the server, not the
  // network, and no minute of retrying first.
  await expect(page.getByText('The server could not save this.').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Check your connection')).toHaveCount(0);
  expect(api.puts.length).toBe(2);
  await expect(editor).toContainText('Start. Refused words.');

  // Leaving now would lose the typing: the browser asks first.
  const asked = new Promise<string>((resolve) => {
    page.once('dialog', (d) => {
      resolve(d.type());
      void d.dismiss();
    });
  });
  await page.close({ runBeforeUnload: true });
  expect(await asked).toBe('beforeunload');
  expect(api.adminCalls).toEqual([]);
});

test('an item submitted from another tab keeps the typing on screen, read-only, until let go', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAsMember(context, baseURL!);
  await page.goto(`/pages?id=${PAGE_ID}`);
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('Start.', { timeout: 60_000 });

  // Another tab submits it; this tab types on and its save is refused.
  api.frozen = true;
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Typed after the submit.');

  const held = page.getByRole('status').filter({ hasText: 'What you typed stays below' });
  await expect(held).toBeVisible({ timeout: 15_000 });
  await expect(held).toContainText('Submitted for review');
  // Still the editor, with the typing, and it takes no more.
  await expect(editor).toContainText('Start. Typed after the submit.');
  await expect(editor).toHaveAttribute('contenteditable', 'false');

  // Let go: the item as the brain has it now (submitted, without the typing).
  await held.getByRole('button', { name: 'Show it as it is now' }).click();
  await expect(held).toHaveCount(0);
  await expect(page.getByText('Typed after the submit.')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText('Start.').first()).toBeVisible();
  expect(api.adminCalls).toEqual([]);
});
