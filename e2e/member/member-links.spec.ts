import { expect, test } from '@playwright/test';
import {
  LIBRARY_ID,
  LIBRARY_NOTE_ID,
  LIBRARY_NOTE_TITLE,
  LIBRARY_TITLE,
  PAGE_ID,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The links a member follows to one item: `/n/<id>` (the permalink the team
 * agent cites its sources with, and Library pages link each other with) and
 * the kinds' own routes that used to open from Mine only (/notes/<id>,
 * /tables/<id>). Each finds the item's source (Mine, Team drafts, the
 * Library, Accepted) and kind, and opens it on that kind's screen, without
 * a single admin route (/api/nodes answers admins only). Runs against the
 * in-memory member API (mock-member-api.ts), no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  await signInAsMember(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

test('a cited /n/ link to a Library page opens it in the Library, not the home', async ({
  page,
}) => {
  await page.goto(`/n/${LIBRARY_ID}`);
  await expect(page).toHaveURL(new RegExp(`/pages\\?src=library&id=${LIBRARY_ID}$`), {
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: LIBRARY_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  expect(api.adminCalls).toEqual([]);
});

test('a /n/ link to an own page opens it in Mine', async ({ page }) => {
  await page.goto(`/n/${PAGE_ID}`);
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${PAGE_ID}$`), { timeout: 60_000 });
  await expect(page.locator('.ProseMirror')).toContainText('Start.', { timeout: 60_000 });
  expect(api.adminCalls).toEqual([]);
});

test('a /n/ link to a Library note opens it on Notes', async ({ page }) => {
  await page.goto(`/n/${LIBRARY_NOTE_ID}`);
  await expect(page).toHaveURL(new RegExp(`/notes\\?src=library&id=${LIBRARY_NOTE_ID}$`), {
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: LIBRARY_NOTE_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  expect(api.adminCalls).toEqual([]);
});

test('/notes/<id> for a Library note opens it in the Library, not as a gone Mine item', async ({
  page,
}) => {
  await page.goto(`/notes/${LIBRARY_NOTE_ID}`);
  await expect(page).toHaveURL(new RegExp(`/notes\\?src=library&id=${LIBRARY_NOTE_ID}$`), {
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: LIBRARY_NOTE_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('This item is gone.')).toHaveCount(0);
  expect(api.adminCalls).toEqual([]);
});

test('/tables/<id> no source has says so, with a way back to Tables', async ({ page }) => {
  await page.goto('/tables/66666666-6666-4666-8666-666666666666');
  await expect(page.getByText('This item is gone, or it is not shared with you.')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('link', { name: 'Back to Tables' }).click();
  await expect(page).toHaveURL(/\/tables$/);
  expect(api.adminCalls).toEqual([]);
});

test('a /n/ link no source has says so, with a way home', async ({ page }) => {
  await page.goto('/n/66666666-6666-4666-8666-666666666666');
  await expect(page.getByText('This item is gone, or it is not shared with you.')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('link', { name: 'Back to your home' })).toBeVisible();
  expect(api.adminCalls).toEqual([]);
});
