import { expect, test, type Page } from '@playwright/test';
import {
  signInAsMember,
  startMockMemberApi,
  type MockHistoryEntry,
  type MockMemberApi,
  type MockSpaceApp,
} from './mock-member-api';

/**
 * A member's own app trash (brain access matrix N6, mantle v0.239.76),
 * against the in-memory API (no brain): Delete with a short confirm on the
 * member's own apps only, Trash with Restore and the 50 app limit said
 * plainly, Delete on the member's own manual snapshots, and an app in Trash
 * (409 `deleted`) said plainly wherever it is opened.
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

const MINE_ID = '61616161-6161-4616-8616-616161616161';
const MINE_TITLE = 'Snag list';
const TEAM_ID = '62626262-6262-4626-8626-626262626262';
const TEAM_TITLE = 'Team roster';
const SNAP_ID = '63636363-6363-4636-8636-636363636363';
const VERSION_ID = '64646464-6464-4646-8646-646464646464';
const at = '2026-10-09T08:00:00.000Z';

const card = (over: Partial<MockSpaceApp>): MockSpaceApp => ({
  id: MINE_ID,
  title: MINE_TITLE,
  description: null,
  mine: true,
  authorName: null,
  sharing: 'private',
  reviewState: 'draft',
  runnable: true,
  hasDraft: false,
  version: 2,
  updatedAt: at,
  ...over,
});

const entry = (over: Partial<MockHistoryEntry>): MockHistoryEntry => ({
  id: SNAP_ID,
  seq: 2,
  kind: 'snapshot',
  trigger: 'manual',
  note: 'Before the big change',
  createdAt: at,
  deletable: true,
  ...over,
});

/** A row of the member's own or the team's apps, by its title. */
const row = (page: Page, title: string) =>
  page
    .getByRole('region', { name: 'Your apps' })
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
const trash = (page: Page) => page.getByRole('region', { name: 'Trash' });
const toast = (page: Page, text: string | RegExp) =>
  page.locator('[role="status"], [role="alert"]').filter({ hasText: text }).first();

test.describe('a member’s app trash', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin);
    api.myApps.routes = true;
    await signInAsMember(context, baseURL!);
  });

  test('Delete moves only the member’s own app to Trash, after a short confirm; Restore brings it back', async ({
    page,
  }) => {
    api.myApps.apps = [
      card({ reviewState: 'submitted' }),
      card({ id: TEAM_ID, title: TEAM_TITLE, mine: false, authorName: 'Ray Teammate' }),
    ];
    await page.goto('/apps');
    const mine = row(page, MINE_TITLE);
    await expect(mine).toBeVisible({ timeout: 60_000 });
    // A teammate's app: no Delete, no History.
    await expect(row(page, TEAM_TITLE)).toBeVisible();
    await expect(row(page, TEAM_TITLE).getByRole('button', { name: 'Delete' })).toHaveCount(0);
    // Nothing in Trash yet: no Trash section.
    await expect(trash(page)).toHaveCount(0);

    // The icon-only buttons sit together at the right, each with a name.
    const icons = mine.getByRole('group', { name: 'App actions' });
    await expect(icons.getByRole('button')).toHaveCount(2);
    await expect(icons.getByRole('button', { name: 'History' })).toBeVisible();
    await icons.getByRole('button', { name: 'Delete' }).click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByRole('heading')).toHaveText(`Move ${MINE_TITLE} to Trash?`);
    await expect(confirm).toContainText('You can restore it from Trash.');
    // Cancel changes nothing.
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect(api.myApps.writes).toEqual([]);

    await icons.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Move to Trash' }).click();
    await expect(toast(page, 'Moved to Trash')).toBeVisible();
    expect(api.myApps.writes).toEqual([`POST /api/member/my-apps/${MINE_ID}/delete`]);
    await expect(row(page, MINE_TITLE)).toHaveCount(0);

    // Trash: one row, the count against the 50 it keeps, the rest behind Info.
    await expect(trash(page).getByRole('heading', { name: 'Trash' })).toBeVisible();
    await expect(trash(page)).toContainText('1 of 50');
    await expect(trash(page).getByRole('listitem')).toHaveCount(1);
    await expect(trash(page).getByRole('listitem')).toContainText(MINE_TITLE);
    await trash(page).getByRole('button', { name: 'About Trash' }).click();
    await expect(page.getByRole('dialog')).toContainText('Nothing in Trash is removed');
    await page.keyboard.press('Escape');

    await trash(page).getByRole('button', { name: 'Restore' }).click();
    await expect(toast(page, 'Restored. It is private now.')).toBeVisible();
    await expect(row(page, MINE_TITLE)).toBeVisible();
    await expect(row(page, MINE_TITLE)).toContainText('Private');
    await expect(trash(page)).toHaveCount(0);
    expect(api.myApps.writes).toEqual([
      `POST /api/member/my-apps/${MINE_ID}/delete`,
      `POST /api/member/my-apps/${MINE_ID}/undelete`,
    ]);
  });

  test('Restore at 50 live apps says the limit plainly, on the row', async ({ page }) => {
    api.myApps.trash = [{ ...card({}), deletedAt: at }];
    api.myApps.liveCount = 50;
    await page.goto('/apps');
    await trash(page).getByRole('button', { name: 'Restore' }).click({ timeout: 60_000 });
    await expect(trash(page).getByRole('alert')).toHaveText(
      'You already have 50 apps, the most one member keeps. Delete one you no longer need, then restore this one.',
    );
    // Still in Trash, nothing else moved.
    await expect(trash(page).getByRole('listitem')).toHaveCount(1);
    await expect(row(page, MINE_TITLE)).toHaveCount(0);
  });

  test('Delete on a full Trash says so plainly', async ({ page }) => {
    api.myApps.apps = [card({})];
    api.myApps.trash = Array.from({ length: 50 }, (_, i) => ({
      ...card({
        id: `70000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        title: `Old app ${i}`,
      }),
      deletedAt: at,
    }));
    await page.goto('/apps');
    await expect(trash(page)).toContainText('50 of 50', { timeout: 60_000 });
    await row(page, MINE_TITLE).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Move to Trash' }).click();
    await expect(toast(page, /Your Trash is full: it keeps at most 50 apps/)).toBeVisible();
    await expect(row(page, MINE_TITLE)).toBeVisible();
  });

  test('the member deletes only their own manual snapshots', async ({ page }) => {
    api.myApps.apps = [card({})];
    api.myApps.history[MINE_ID] = [
      entry({}),
      entry({
        id: VERSION_ID,
        seq: 1,
        kind: 'version',
        trigger: 'publish',
        note: null,
        deletable: false,
      }),
    ];
    await page.goto('/apps');
    await row(page, MINE_TITLE).getByRole('button', { name: 'History' }).click({ timeout: 60_000 });
    const dialog = page.getByRole('dialog', { name: `History of ${MINE_TITLE}` });
    await expect(dialog.getByRole('listitem')).toHaveCount(2);
    // One Delete: the manual snapshot, never the version.
    await expect(dialog.getByRole('button', { name: /^Delete snapshot/ })).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Delete snapshot v2' }).click();
    await expect(dialog).toContainText('Delete snapshot v2 and its copy of the data?');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(toast(page, 'Snapshot deleted')).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    expect(api.myApps.writes).toEqual([`DELETE /api/member/my-apps/${MINE_ID}/history/${SNAP_ID}`]);
  });

  test('a snapshot that is not the member’s own: the refusal in plain words', async ({ page }) => {
    api.myApps.apps = [card({})];
    // The list said deletable; the brain then refused (another tab changed it).
    api.myApps.history[MINE_ID] = [entry({})];
    await page.goto('/apps');
    await row(page, MINE_TITLE).getByRole('button', { name: 'History' }).click({ timeout: 60_000 });
    const dialog = page.getByRole('dialog', { name: `History of ${MINE_TITLE}` });
    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    api.myApps.history[MINE_ID] = [entry({ deletable: false })];
    await dialog.getByRole('button', { name: 'Delete snapshot v2' }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(toast(page, 'You can delete only snapshots you took yourself.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Delete snapshot/ })).toHaveCount(0);
  });

  test('an app moved to Trash elsewhere: 409 deleted is said plainly and the list catches up', async ({
    page,
  }) => {
    api.myApps.apps = [card({})];
    await page.goto('/apps');
    await expect(row(page, MINE_TITLE)).toBeVisible({ timeout: 60_000 });
    // Over MCP, or in another tab.
    api.myApps.trash = [{ ...card({}), deletedAt: at }];
    api.myApps.apps = [];
    api.myApps.history[MINE_ID] = [entry({})];

    // The page still shows it; its History answers 409 deleted.
    await row(page, MINE_TITLE).getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'This app is in your Trash. Restore it from Trash in Apps to use it again.',
    );
    await page.keyboard.press('Escape');

    // Share answers 409 deleted too: said plainly, then the row moves to Trash.
    await row(page, MINE_TITLE).getByRole('button', { name: 'Share with team' }).click();
    await expect(
      toast(page, 'This app is in your Trash. Restore it from Trash in Apps to use it again.'),
    ).toBeVisible();
    await expect(row(page, MINE_TITLE)).toHaveCount(0);
    await expect(trash(page).getByRole('listitem')).toContainText(MINE_TITLE);
  });

  test('opening an app that is in Trash says where it is, with a way there', async ({ page }) => {
    api.myApps.trash = [{ ...card({}), deletedAt: at }];
    await page.goto(`/apps/${MINE_ID}`);
    await expect(
      page.getByText('This app is in your Trash. Restore it from Trash in Apps to use it again.'),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.getByRole('link', { name: 'Open Trash' }).click();
    await expect(page).toHaveURL(/\/apps#trash$/);
    await expect(trash(page).getByRole('listitem')).toContainText(MINE_TITLE);
  });
});
