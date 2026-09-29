import { expect, test } from '@playwright/test';
import {
  CLIENT_ITEM_ID,
  CLIENT_ITEM_TITLE,
  PUBLIC_PAGE_TITLE,
  signInAsAdmin,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * Shared links after client logins C3, in the browser, against the
 * in-memory API (no brain): every live link is public, and the old client
 * links the brain retired are listed below them, quieter, with no copy and
 * no open (the link is dead), each linking to its item and the note to
 * Clients. A brain before C3 sends no retired list, and none shows.
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
  await signInAsAdmin(context, baseURL!);
});

const retiredList = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'Retired client links' });

test('lists the retired client links below the live ones, with no copy and no open', async ({
  page,
}) => {
  await page.goto('/team-admin?view=shares');
  await expect(page.getByRole('heading', { name: 'Retired client links' })).toBeVisible({
    timeout: 60_000,
  });
  // The live link: public, with its Copy and Open, and no old-link mark.
  await expect(page.getByRole('heading', { name: PUBLIC_PAGE_TITLE })).toBeVisible();
  await expect(page.getByText('Old client link')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Open link' })).toHaveCount(1);

  const section = page.getByRole('region', { name: 'Retired client links' });
  await expect(
    section.getByText('These old links now ask visitors to sign in as a client.'),
  ).toBeVisible();
  await expect(section.getByRole('link', { name: 'Clients', exact: true })).toHaveAttribute(
    'href',
    '/team-admin?view=client-logins',
  );
  const list = retiredList(page);
  await expect(list.getByRole('link', { name: CLIENT_ITEM_TITLE })).toHaveAttribute(
    'href',
    `/n/${CLIENT_ITEM_ID}`,
  );
  await expect(list).toContainText(/retired \S/);
  await expect(list).toContainText('Page now at Client');
  await expect(list).toContainText(/7 views, last \S/);
  // Nothing to copy or open on a dead link.
  await expect(list.getByRole('button')).toHaveCount(0);
  await expect(list.getByRole('link')).toHaveCount(1);
});

test('with no live link, says nothing is shared and still lists the retired ones', async ({
  page,
}) => {
  api.admin.publicShare = false;
  await page.goto('/team-admin?view=shares');
  await expect(page.getByText('Nothing is shared right now.')).toBeVisible({ timeout: 60_000 });
  await expect(retiredList(page).getByRole('link', { name: CLIENT_ITEM_TITLE })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);
});

test('a brain before C3 sends no retired list, and none shows', async ({ page }) => {
  api.admin.sendsRetired = false;
  await page.goto('/team-admin?view=shares');
  await expect(page.getByRole('heading', { name: PUBLIC_PAGE_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: 'Retired client links' })).toHaveCount(0);
  await expect(page.getByText(/sign in as a client/)).toHaveCount(0);
});
