import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  CLIENT_AGENT_NAME,
  CLIENT_CHAT_REPLY,
  CLIENT_EMAIL,
  CLIENT_LOGIN_ID,
  CLIENT_NAME,
  MEMBER_LOGIN_ID,
  loginRow,
  signInAsAdmin,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * A client's own chat (client logins C4), against the in-memory API (no
 * brain): the dock on the client home, a send and its reply found by a
 * poll (a client has no live stream), the closed chat, a limit reached; and
 * the admin's side in Settings > Logins: each member's and client's own Chat
 * (was Team admin > Member chats), each client's chat use today (Client
 * settings), and a client's request badged. A client asks client routes only:
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

  const client = {
    id: CLIENT_LOGIN_ID,
    email: CLIENT_EMAIL,
    displayName: CLIENT_NAME,
    contactId: null,
    disabled: false,
    createdAt: '2026-09-20T08:00:00.000Z',
    lastLoginAt: null,
    openLink: null,
    lastLinkUsedAt: null,
  };
  /** A second member login with no row in the chat roster. */
  const QUIET_ID = '4a4a4a4a-4a4a-44a4-84a4-4a4a4a4a4a4a';

  test('each login’s Chat shows its own thread; a client sits under Clients, wearing Client', async ({
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
    const said = (id: string, text: string) => ({
      id,
      direction: 'inbound' as const,
      text,
      status: 'complete' as const,
      error: null,
      traceId: null,
      createdAt: '2026-09-28T08:00:00.000Z',
    });
    api.admin.logins.push(
      loginRow({
        id: MEMBER_LOGIN_ID,
        email: 'mo@example.invalid',
        displayName: 'Mo Member',
        role: 'member',
      }),
      loginRow({
        id: QUIET_ID,
        email: 'lee@example.invalid',
        displayName: 'Lee Member',
        role: 'member',
      }),
    );
    api.admin.clientLogins = [client];
    // The member is the roster's first row: what the brain falls back to
    // for a login it has no row for.
    api.admin.memberChats = [
      chat({
        loginId: MEMBER_LOGIN_ID,
        name: 'Mo Member',
        email: 'mo@example.invalid',
        role: 'member',
      }),
      chat({ loginId: CLIENT_LOGIN_ID, name: CLIENT_NAME, email: CLIENT_EMAIL, role: 'client' }),
    ];
    api.admin.memberChatThreads[MEMBER_LOGIN_ID] = [said('m-1', 'A member question')];
    api.admin.memberChatThreads[CLIENT_LOGIN_ID] = [said('c-1', 'A client question')];

    await page.goto('/settings/users');
    const clients = page.getByRole('region', { name: /^Clients/ });
    const clientCard = clients.getByRole('button', { name: new RegExp(CLIENT_NAME) });
    const memberCard = page.getByRole('button', { name: /^Mo Member/ });
    await expect(clientCard).toBeVisible({ timeout: 60_000 });
    await expect(memberCard).toBeVisible();
    // The client is in Clients; the member is not, and wears Member.
    await expect(clients.getByRole('button', { name: /Mo Member/ })).toHaveCount(0);
    await expect(memberCard.getByText('Member', { exact: true })).toBeVisible();

    const header = page.getByTestId('item-header');
    const chatButton = header.getByRole('button', { name: 'Chat' });
    const detail = page.getByTestId('detail');

    // The admin's own login has no Chat: an admin does not chat with the
    // team agent.
    await expect(header.getByRole('heading', { name: /^Ada Admin/ })).toBeVisible();
    await expect(chatButton).toHaveCount(0);

    await memberCard.click();
    await expect(header.getByRole('heading', { name: /^Mo Member/ })).toBeVisible();
    await expect(header.getByText('Client', { exact: true })).toHaveCount(0);
    await expect(chatButton).toHaveAttribute('aria-pressed', 'false');
    await chatButton.click();
    await expect(chatButton).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByText('A member question')).toBeVisible({ timeout: 15_000 });
    await expect(detail.getByText('A client question')).toHaveCount(0);

    // Another login opens on its details, then its own thread only.
    await clientCard.click();
    await expect(
      header.getByRole('heading', { name: new RegExp(`^${CLIENT_NAME}`) }),
    ).toBeVisible();
    await expect(header.getByText('Client', { exact: true })).toBeVisible();
    await expect(chatButton).toHaveAttribute('aria-pressed', 'false');
    await chatButton.click();
    await expect(detail.getByText('A client question')).toBeVisible({ timeout: 15_000 });
    await expect(detail.getByText('A member question')).toHaveCount(0);
    await expect(page.getByText(/no longer a member/)).toHaveCount(0);

    // A login the roster has no row for: the brain answers with the first
    // row's thread, and the pane says this login has not chatted instead of
    // showing someone else's.
    await page.getByRole('button', { name: /^Lee Member/ }).click();
    await chatButton.click();
    await expect(detail.getByText('Lee Member has not chatted with the team agent.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(detail.getByText('A member question')).toHaveCount(0);
  });

  test('Client settings: each client login’s chat use today, a limit reached marked', async ({
    page,
  }) => {
    api.admin.clientLogins = [client];
    api.admin.chatUsage = {
      limits: { dailyTurns: 50, dailyTokens: 200000 },
      rows: [{ loginId: CLIENT_LOGIN_ID, turnsToday: 50, tokensToday: 1200 }],
    };
    await page.goto('/settings/users?selected=client-settings');
    const card = page.getByRole('region', { name: 'Chat use today' });
    await expect(card).toContainText(CLIENT_NAME, { timeout: 60_000 });
    await expect(card).toContainText('50 of 50 turns · 1,200 of 200,000 tokens · limit reached');
  });

  test('Client settings on a brain before C4: no chat use card', async ({ page }) => {
    api.admin.clientLogins = [client];
    const asked = page.waitForResponse((r) => r.url().includes('/api/team-admin/clients/usage'));
    await page.goto('/settings/users?selected=client-settings');
    expect((await asked).status()).toBe(404);
    await expect(page.getByRole('region', { name: /^Clients/ })).toContainText(CLIENT_NAME, {
      timeout: 60_000,
    });
    await expect(page.getByRole('heading', { name: 'Sign-in codes by email' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chat use today' })).toHaveCount(0);
    // Not an error either: a 404 is a brain without the route. (The list's
    // Client settings card names chat use as what the step holds: the pane
    // is what must not.)
    await expect(page.getByTestId('detail').getByText(/chat use/i)).toHaveCount(0);
  });

  test('a client’s words load no picture on staff screens: Requests, the task, the login’s Chat (tier U5)', async ({
    page,
  }) => {
    const PIXEL = 'https://tracker.example/p.gif';
    const elsewhere: string[] = [];
    await page.route('https://tracker.example/**', (route) => {
      elsewhere.push(route.request().url());
      return route.abort();
    });
    const body = `Please give access.\n\n![x](${PIXEL})`;
    api.admin.requests = [
      {
        taskId: 't-1',
        title: 'Access',
        body,
        status: 'open',
        priority: 'normal',
        createdAt: '2026-09-28T08:00:00.000Z',
        contactId: null,
        contactName: null,
        notifiedAt: null,
        loginId: CLIENT_LOGIN_ID,
        fromClient: true,
      },
    ];
    api.admin.clientLogins = [client];
    api.admin.tasks = [
      {
        id: 't-1',
        title: 'Access',
        body,
        status: 'open',
        priority: 'normal',
        dueAt: null,
        tags: [],
        todos: [],
        rank: null,
        commentCount: 0,
        summary: null,
        archivedAt: null,
        createdAt: '2026-09-28T08:00:00.000Z',
        updatedAt: '2026-09-28T08:00:00.000Z',
      },
    ];
    api.admin.memberChats = [
      {
        loginId: CLIENT_LOGIN_ID,
        name: CLIENT_NAME,
        email: CLIENT_EMAIL,
        role: 'client',
        active: true,
        lastMessageAt: '2026-09-28T08:00:00.000Z',
        lastMessageText: 'Done.',
        lastMessageDirection: 'outbound',
        messageCount: 1,
      },
    ];
    api.admin.memberChatThreads[CLIENT_LOGIN_ID] = [
      {
        id: 'o-1',
        direction: 'outbound',
        text: `Done, as asked.\n\n![x](${PIXEL})`,
        status: 'complete',
        error: null,
        traceId: null,
        createdAt: '2026-09-28T08:00:00.000Z',
      },
    ];

    for (const [path, words] of [
      ['/team-admin?view=requests', 'Please give access.'],
      ['/tasks?selected=t-1', 'Please give access.'],
      [`/settings/users?selected=${CLIENT_LOGIN_ID}&view=chat`, 'Done, as asked.'],
    ] as const) {
      await page.goto(path);
      const text = page.getByText(words).first();
      await expect(text).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('[x]').first()).toBeVisible();
      await expect(page.locator(`img[src="${PIXEL}"]`)).toHaveCount(0);
    }
    await page.waitForTimeout(500);
    expect(elsewhere).toEqual([]);
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
      request({
        taskId: 't-1',
        title: 'Update the brochure',
        loginId: CLIENT_LOGIN_ID,
        fromClient: true,
      }),
      request({ taskId: 't-2', title: 'Fix the rota', loginId: MEMBER_LOGIN_ID }),
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

  test('Requests: View their chat opens the login’s Chat in Settings > Logins; an old portal request has none', async ({
    page,
  }) => {
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
    api.admin.clientLogins = [client];
    api.admin.memberChats = [
      {
        loginId: CLIENT_LOGIN_ID,
        name: CLIENT_NAME,
        email: CLIENT_EMAIL,
        role: 'client',
        active: false,
        lastMessageAt: '2026-09-28T08:00:00.000Z',
        lastMessageText: 'Thanks.',
        lastMessageDirection: 'inbound',
        messageCount: 1,
      },
    ];
    api.admin.memberChatThreads[CLIENT_LOGIN_ID] = [
      {
        id: 'i-1',
        direction: 'inbound',
        text: 'Please update the brochure.',
        status: 'complete',
        error: null,
        traceId: null,
        createdAt: '2026-09-28T08:00:00.000Z',
      },
    ];
    api.admin.requests = [
      request({
        taskId: 't-1',
        title: 'Update the brochure',
        loginId: CLIENT_LOGIN_ID,
        fromClient: true,
      }),
      // From the retired team portal: a contact, no login. Its old chat is
      // not shown anywhere any more (Chat archive removed).
      request({
        taskId: 't-2',
        title: 'Old portal question',
        contactId: '4b4b4b4b-4b4b-44b4-84b4-4b4b4b4b4b4b',
        contactName: 'Old Contact',
      }),
    ];
    await page.goto('/team-admin?view=requests');
    const chatLink = page.getByRole('link', { name: /View their chat/ });
    await expect(chatLink).toHaveAttribute(
      'href',
      `/settings/users?selected=${CLIENT_LOGIN_ID}&view=chat`,
      { timeout: 60_000 },
    );

    await page.getByRole('listitem').filter({ hasText: 'Old portal question' }).click();
    await expect(page.getByRole('heading', { name: /Old portal question/ })).toBeVisible();
    await expect(chatLink).toHaveCount(0);

    await page.getByRole('listitem').filter({ hasText: 'Update the brochure' }).click();
    await chatLink.click();
    await expect(page).toHaveURL(/\/settings\/users\?selected=.+&view=chat$/, { timeout: 30_000 });
    await expect(
      page.getByTestId('item-header').getByRole('button', { name: 'Chat' }),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
    await expect(page.getByText('Please update the brochure.')).toBeVisible({ timeout: 15_000 });
  });
});
