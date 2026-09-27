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
