import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  CLIENT_AGENT_NAME,
  CLIENT_CHAT_REPLY,
  CLIENT_EMAIL,
  CLIENT_LOGIN_ID,
  CLIENT_NAME,
  signInAsAdmin,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * A client's own chat (client logins C4), against the in-memory API (no
 * brain): the dock on the client home, a send and its reply found by a
 * poll (a client has no live stream), the closed chat, a limit reached; and
 * the admin's side: Member chats filtered to clients, each client's chat use
 * today, and a client's request badged. A client asks client routes only:
 * each client test ends with no other route called (`clientCalls`).
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

async function signInAsClient(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: 'mantle_authed', value: '1', url: baseURL },
    { name: 'mantle_client', value: '1', url: baseURL },
  ]);
}

const dock = (page: Page) => page.getByRole('region', { name: 'Chat' });

async function openChat(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Chat', exact: true }).click({ timeout: 60_000 });
  await expect(dock(page)).toBeVisible();
}

test.describe('the client chat', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsClient(context, baseURL!);
  });

  test('nothing is asked until the chat opens', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Shared with you' })).toBeVisible({
      timeout: 60_000,
    });
    // A while on the home: the closed dock never polls.
    await page.waitForTimeout(4_000);
    expect(api.clientChat.gets).toEqual([]);
  });

  test('a client opens the chat, sends, and sees the reply after a poll', async ({ page }) => {
    await openChat(page);
    // The header names the agent, never a person.
    await expect(dock(page).getByRole('heading', { name: CLIENT_AGENT_NAME })).toBeVisible({
      timeout: 30_000,
    });
    await expect(dock(page)).toContainText(`Ask ${CLIENT_AGENT_NAME} about`);

    const box = dock(page).getByRole('textbox', { name: 'Message' });
    await box.fill('When is the survey?');
    await box.press('Enter');
    await expect(dock(page)).toContainText('When is the survey?', { timeout: 15_000 });
    // The first ask after the send still has the reply pending; a poll
    // (about 3 s later) finds it.
    await expect(dock(page).getByText('Thinking…')).toBeVisible({ timeout: 15_000 });
    await expect(dock(page)).toContainText(CLIENT_CHAT_REPLY, { timeout: 15_000 });
    await expect(dock(page).getByText('Thinking…')).toHaveCount(0);

    expect(api.clientChat.posts).toHaveLength(1);
    const [post] = api.clientChat.posts;
    expect(post!.text).toBe('When is the survey?');
    expect(post!.status).toBe(202);
    // Every send carries an Idempotency-Key.
    expect(post!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.clientChat.gets.length).toBeGreaterThanOrEqual(3);
    expect(api.clientCalls).toEqual([]);
    expect(api.clientRouteCalls.every((c) => / \/api\/client\//.test(c))).toBe(true);
  });

  test('closing stops the polling; opening again asks at once', async ({ page }) => {
    await openChat(page);
    const box = dock(page).getByRole('textbox', { name: 'Message' });
    await box.fill('When is the survey?');
    await box.press('Enter');
    // The reply is pending: an open dock would ask every 3 s.
    await expect(dock(page).getByText('Thinking…')).toBeVisible({ timeout: 15_000 });
    await dock(page).getByRole('button', { name: 'Close chat' }).click();
    const asked = api.clientChat.gets.length;
    await page.waitForTimeout(5_000);
    expect(api.clientChat.gets.length).toBe(asked);
    // Opened again: asked straight away, not at the next poll.
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await expect(dock(page)).toContainText(CLIENT_CHAT_REPLY, { timeout: 2_000 });
  });

  test('the chat not open: says so, with no composer', async ({ page }) => {
    api.clientChat.agent = null;
    await openChat(page);
    await expect(dock(page)).toContainText('Chat is not open yet.', { timeout: 30_000 });
    await expect(dock(page).getByRole('textbox', { name: 'Message' })).toHaveCount(0);
    await expect(dock(page).getByRole('button', { name: 'Send' })).toHaveCount(0);
    expect(api.clientCalls).toEqual([]);
  });

  test('the daily limit reached: the send is refused in plain words', async ({ page }) => {
    api.clientChat.refusal = {
      status: 429,
      body: { error: 'Daily cap reached.', reason: 'daily_cap' },
    };
    await openChat(page);
    const box = dock(page).getByRole('textbox', { name: 'Message' });
    await box.fill('One more question');
    await dock(page).getByRole('button', { name: 'Send' }).click();
    await expect(dock(page).getByRole('alert')).toHaveText(
      'You have reached today’s limit for messages. You can send again tomorrow.',
      { timeout: 15_000 },
    );
    // The text stays, to send tomorrow; nothing was queued.
    await expect(box).toHaveValue('One more question');
    expect(api.clientChat.messages).toEqual([]);
    expect(api.clientChat.posts.map((p) => p.status)).toEqual([429]);
    expect(api.clientCalls).toEqual([]);
  });

  test('Close hides the dock and the half-written message survives', async ({ page }) => {
    await openChat(page);
    const box = dock(page).getByRole('textbox', { name: 'Message' });
    await box.fill('Draft');
    await dock(page).getByRole('button', { name: 'Close chat' }).click();
    await expect(dock(page)).toBeHidden();
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await expect(box).toHaveValue('Draft');
  });
});

test.describe('the admin side of client chat', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
  });

  test('Member chats: All, Members, Clients; a client row wears the Client badge', async ({
    page,
  }) => {
    const chat = (over: Record<string, unknown>) => ({
      active: true,
      lastMessageAt: '2026-09-28T08:00:00.000Z',
      lastMessageText: 'Hello there',
      lastMessageDirection: 'inbound',
      messageCount: 1,
      ...over,
    });
    api.admin.memberChats = [
      chat({ loginId: 'm-1', name: 'Mo Member', email: 'mo@example.invalid', role: 'member' }),
      chat({ loginId: 'c-1', name: CLIENT_NAME, email: CLIENT_EMAIL, role: 'client' }),
    ];
    await page.goto('/team-admin?view=chats');
    const rows = page.getByRole('listitem');
    const client = rows.filter({ hasText: CLIENT_NAME });
    const member = rows.filter({ hasText: 'Mo Member' });
    await expect(client).toBeVisible({ timeout: 60_000 });
    await expect(member).toBeVisible();
    await expect(client.getByText('Client', { exact: true })).toBeVisible();
    await expect(member.getByText('Client', { exact: true })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(member).toHaveCount(0);
    await expect(client).toBeVisible();

    await page.getByRole('tab', { name: 'Members' }).click();
    await expect(client).toHaveCount(0);
    await expect(member).toBeVisible();

    await page.getByRole('tab', { name: 'All' }).click();
    await expect(client).toBeVisible();
    await expect(member).toBeVisible();
  });

  test('Clients: each client login’s chat use today, a limit reached marked', async ({ page }) => {
    api.admin.clientLogins = [
      {
        id: CLIENT_LOGIN_ID,
        email: CLIENT_EMAIL,
        displayName: CLIENT_NAME,
        contactId: null,
        disabled: false,
        createdAt: '2026-09-20T08:00:00.000Z',
        lastLoginAt: null,
        openLink: null,
        lastLinkUsedAt: null,
      },
    ];
    api.admin.chatUsage = {
      limits: { dailyTurns: 50, dailyTokens: 200000 },
      rows: [{ loginId: CLIENT_LOGIN_ID, turnsToday: 50, tokensToday: 1200 }],
    };
    await page.goto('/team-admin?view=client-logins');
    const card = page.getByRole('region', { name: 'Chat use today' });
    await expect(card).toContainText(CLIENT_NAME, { timeout: 60_000 });
    await expect(card).toContainText('50 of 50 turns · 1,200 of 200,000 tokens · limit reached');
  });

  test('Clients on a brain before C4: no chat use card', async ({ page }) => {
    api.admin.clientLogins = [
      {
        id: CLIENT_LOGIN_ID,
        email: CLIENT_EMAIL,
        displayName: CLIENT_NAME,
        contactId: null,
        disabled: false,
        createdAt: '2026-09-20T08:00:00.000Z',
        lastLoginAt: null,
        openLink: null,
        lastLinkUsedAt: null,
      },
    ];
    const asked = page.waitForResponse((r) => r.url().includes('/api/team-admin/clients/usage'));
    await page.goto('/team-admin?view=client-logins');
    expect((await asked).status()).toBe(404);
    await expect(page.getByRole('list', { name: 'Client logins' })).toContainText(CLIENT_NAME, {
      timeout: 60_000,
    });
    await expect(page.getByRole('heading', { name: 'Sign-in codes by email' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chat use today' })).toHaveCount(0);
    // Not an error either: a 404 is a brain without the route.
    await expect(page.getByText(/chat use/i)).toHaveCount(0);
  });

  test('Requests: a client’s request wears the Client badge; a member’s none', async ({ page }) => {
    const request = (over: Record<string, unknown>) => ({
      body: '',
      status: 'open',
      priority: 'normal',
      createdAt: '2026-09-28T08:00:00.000Z',
      contactId: null,
      contactName: null,
      notifiedAt: null,
      ...over,
    });
    api.admin.requests = [
      request({ taskId: 't-1', title: 'Update the brochure', loginId: 'c-1', fromClient: true }),
      request({ taskId: 't-2', title: 'Fix the rota', loginId: 'm-1' }),
    ];
    await page.goto('/team-admin?view=requests');
    const clientRow = page.getByRole('listitem').filter({ hasText: 'Update the brochure' });
    const memberRow = page.getByRole('listitem').filter({ hasText: 'Fix the rota' });
    await expect(clientRow).toBeVisible({ timeout: 60_000 });
    await expect(clientRow.getByText('Client', { exact: true })).toBeVisible();
    await expect(clientRow).toContainText('from a client');
    await expect(memberRow.getByText('Client', { exact: true })).toHaveCount(0);
    await expect(memberRow).toContainText('from a team member');
  });
});
