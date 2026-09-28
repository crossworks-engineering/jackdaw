import { request } from '@playwright/test';
import { PRESENCE_COOKIE, TOKEN_STORAGE_KEY } from '../lib/contract';
import { expect, test } from '../lib/fixtures';

/**
 * A member login against a REAL brain, end to end: the owner invites by
 * email, the person redeems the invite with a password, signs in, uploads an
 * image into Mine, and the member's Files screen loads it by `?at=` (the
 * member asset token; an <img> carries no bearer). The member specs in
 * e2e/member run on a mock API; this is the one that proves the brain's
 * routes and gate agree with the client. The `?at=` gate bug (brain before
 * v0.232.303: the gate never admitted the token on the member byte routes)
 * shipped because nothing ran this path against a brain.
 *
 * Everything goes through the real public routes, so a fresh CI brain needs
 * no seeding: POST /api/team-admin/invites (owner), /api/auth/invite/accept,
 * /api/auth/token, /api/member/space-files, /api/member/shell.
 */
const MEMBER_HINT_COOKIE = 'mantle_member';
const PASSWORD = 'e2e-member-password-1';
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.describe('member login (real brain)', () => {
  // The member screens live on the client app, like every owner screen.
  test.skip(({ topology }) => topology === 'same-origin', 'the member UI lives on the client app');

  test('invite, sign in, upload into Mine, and load the image by ?at=', async ({
    ownerApi,
    browser,
    serverURL,
    clientURL,
  }) => {
    const email = `e2e-member-${Date.now()}@example.com`;

    // The owner invites; the code is in this answer once.
    const invited = await ownerApi.post('/api/team-admin/invites', {
      data: { email, displayName: 'E2E Member' },
    });
    expect(invited.status(), await invited.text()).toBe(201);
    const { code } = (await invited.json()) as { code: string };

    // The person redeems it with their own password, then signs in.
    const anon = await request.newContext({ baseURL: serverURL });
    const accepted = await anon.post('/api/auth/invite/accept', {
      data: { code, password: PASSWORD },
    });
    expect(accepted.status(), await accepted.text()).toBe(200);
    const signedIn = await anon.post('/api/auth/token', {
      data: { email, password: PASSWORD, deviceName: 'e2e-member' },
    });
    expect(signedIn.status(), await signedIn.text()).toBe(200);
    const { token } = (await signedIn.json()) as { token: string };
    await anon.dispose();

    const member = await request.newContext({
      baseURL: serverURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    // An upload into Mine.
    const uploaded = await member.post('/api/member/space-files', {
      multipart: { file: { name: 'dot.png', mimeType: 'image/png', buffer: PNG_1PX } },
    });
    expect(uploaded.status(), await uploaded.text()).toBeLessThan(300);
    const { row } = (await uploaded.json()) as { row: { id: string; type: string } };
    expect(row.type).toBe('file');

    // The bytes by the member asset token alone, the way an <img> asks.
    const shell = await member.get('/api/member/shell');
    expect(shell.status()).toBe(200);
    const { assetToken } = (await shell.json()) as { assetToken: string };
    expect(assetToken).toBeTruthy();
    await member.dispose();
    const bare = await request.newContext({ baseURL: serverURL });
    const bytes = await bare.get(
      `/api/member/space/${row.id}/bytes?at=${encodeURIComponent(assetToken)}`,
    );
    expect(bytes.status()).toBe(200);
    expect(bytes.headers()['content-type']).toMatch(/^image\/png/);
    await bare.dispose();

    // And through the member's own screen: Files opens the item and its
    // image loads (naturalWidth is 0 for an image that failed).
    const ctx = await browser.newContext();
    await ctx.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key, value);
      },
      [TOKEN_STORAGE_KEY, token] as const,
    );
    const client = new URL(clientURL);
    await ctx.addCookies(
      [PRESENCE_COOKIE, MEMBER_HINT_COOKIE].map((name) => ({
        name,
        value: '1',
        domain: client.hostname,
        path: '/',
        secure: client.protocol === 'https:',
        sameSite: 'Lax' as const,
      })),
    );
    const page = await ctx.newPage();
    await page.goto(`/files?id=${row.id}`);
    const img = page.locator(`img[src*="/api/member/space/${row.id}/bytes"]`).first();
    await expect(img).toBeVisible({ timeout: 30_000 });
    await expect(img).toHaveAttribute('src', /[?&]at=/);
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await ctx.close();
  });
});
