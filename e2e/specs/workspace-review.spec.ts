import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../lib/fixtures';
import { ARTIFACTS_DIR } from '../lib/env';
import { openFromTree } from '../lib/tree';

/**
 * A member's submitted item waits in its own workspace (workspace review
 * pattern, part 2, 2026-10-09): Pages, Notes, Tables, Draw and Files each
 * show "Waiting for approval" above the tree. Picking a card highlights it,
 * keeps the tree column and opens the item in the pane under ONE header:
 * words (Approve, Reject, Take over) left of the icon-only group, who sent
 * it behind Info, and the SAME HEIGHT as that workspace's normal item
 * header, measured against a real brain item of the kind.
 *
 * The queue and the item are served by the spec (route mocks): a real one
 * needs a member to write and submit it. The screen and its layout are what
 * is under test here; the brain's review rules have their own tests.
 */

type Kind = 'page' | 'note' | 'table' | 'draw' | 'file';

const ID: Record<Kind, string> = {
  page: '00000000-0000-4000-8000-0000000000a1',
  note: '00000000-0000-4000-8000-0000000000a2',
  table: '00000000-0000-4000-8000-0000000000a3',
  draw: '00000000-0000-4000-8000-0000000000a4',
  file: '00000000-0000-4000-8000-0000000000a5',
};

const SCREEN: Record<Kind, string> = {
  page: '/pages',
  note: '/notes',
  table: '/tables',
  draw: '/draw',
  file: '/files',
};

const bodyOf = (kind: Kind, title: string) => {
  switch (kind) {
    case 'page':
      return {
        type: 'page',
        page: {
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checked it.' }] }],
          },
          draft: null,
          draftRev: 0,
          title,
        },
      };
    case 'note':
      return { type: 'note', note: { content: 'Checked it.' } };
    case 'table':
      return {
        type: 'table',
        table: {
          data: {
            columns: [{ id: 'c1', name: 'Item', type: 'text' }],
            rows: [{ id: 'r1', cells: { c1: 'Survey' } }],
          },
          draft: null,
        },
      };
    case 'draw':
      return { type: 'draw', draw: { draft: null } };
    case 'file':
      return {
        type: 'file',
        file: { filename: `${title}.txt`, mimeType: 'text/plain', sizeBytes: 11 },
      };
  }
};

/** A brain item of the kind, for the normal header; returns its id and how
 *  to remove it. Plain: no description, no tags (each adds a line). */
async function brainItem(
  api: APIRequestContext,
  kind: Kind,
  title: string,
): Promise<{ id: string; remove: () => Promise<unknown> }> {
  const json = async (res: Awaited<ReturnType<APIRequestContext['post']>>) => {
    expect(res.ok(), `create ${kind}: ${res.status()}`).toBeTruthy();
    return (await res.json()) as Record<string, { id: string } | string | undefined>;
  };
  switch (kind) {
    case 'page': {
      const { page } = await json(await api.post('/api/pages', { data: { title } }));
      const id = (page as { id: string }).id;
      return { id, remove: () => api.delete(`/api/pages/${id}`) };
    }
    case 'note': {
      const { note } = await json(
        await api.post('/api/notes', { data: { title, content: 'A plain note' } }),
      );
      const id = (note as { id: string }).id;
      return { id, remove: () => api.delete(`/api/notes/${id}`) };
    }
    case 'table': {
      const { table } = await json(await api.post('/api/tables', { data: { title } }));
      const id = (table as { id: string }).id;
      return { id, remove: () => api.delete(`/api/tables/${id}`) };
    }
    case 'draw': {
      const { draw } = await json(await api.post('/api/draws', { data: { title } }));
      const id = (draw as { id: string }).id;
      return { id, remove: () => api.delete(`/api/draws/${id}`) };
    }
    case 'file': {
      const body = await json(
        await api.post('/api/files/files', {
          data: { parentPath: 'files', filename: `${title}.txt`, content: 'plain text' },
        }),
      );
      const id = (body.file as { id: string } | undefined)?.id ?? (body.id as string);
      return { id, remove: () => api.delete(`/api/files/files/${id}`) };
    }
  }
}

test.describe('workspace review', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  for (const kind of Object.keys(ID) as Kind[]) {
    test(`${SCREEN[kind]}: a waiting ${kind} opens beside the tree, under a header of normal height`, async ({
      ownerApi,
      ownerPage,
      serverURL,
    }) => {
      const id = ID[kind];
      const title = `E2E waiting ${kind}`;
      const row = {
        id,
        type: kind,
        title,
        icon: null,
        sharing: 'private',
        reviewState: 'submitted',
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reason: 'submitted',
        author: { loginId: null, name: 'A member', email: null, inactive: false, role: 'member' },
      };
      const reply = (body: unknown, status = 200) => ({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      await ownerPage.route(`${serverURL}/api/team-admin/submissions**`, (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/team-admin/submissions')
          return route.fulfill(reply({ items: [row], counts: { submitted: 1, leftBehind: 0 } }));
        if (path === `/api/team-admin/submissions/${id}`)
          return route.fulfill(reply({ row, body: bodyOf(kind, title), comments: [] }));
        if (path === `/api/team-admin/submissions/${id}/svg`)
          return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg/>' });
        if (path === `/api/team-admin/submissions/${id}/bytes`)
          return route.fulfill({ status: 200, contentType: 'text/plain', body: 'Checked it.' });
        return route.fulfill(reply({ error: 'not found' }, 404));
      });

      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(SCREEN[kind]);
      const list = ownerPage.locator('[data-testid="list"]');
      const section = list.getByRole('region', { name: 'Waiting for approval' });
      const card = section.getByRole('button', { name: new RegExp(title) });
      await card.click({ timeout: 60_000 });

      // The tree column stays, the card is the selection, the URL says so.
      await expect(list.getByRole('textbox', { name: /^Search / })).toBeVisible();
      expect(await list.evaluate((el) => (el as HTMLElement).offsetWidth)).toBeGreaterThan(200);
      await expect(card).toHaveAttribute('data-selected', 'true');
      await expect.poll(() => new URL(ownerPage.url()).searchParams.get('review')).toBe(id);

      // One header: the title, words on the left, named icons on the right.
      const detail = ownerPage.locator('[data-testid="detail"]');
      const header = detail.getByTestId('item-review-header');
      await expect(header.getByRole('heading', { name: title })).toBeVisible();
      await expect(detail.getByTestId('item-review-header')).toHaveCount(1);
      const words = header.getByTestId('review-header-text-actions');
      const icons = header.getByTestId('review-header-icon-actions');
      await expect(words.getByRole('button', { name: 'Approve' })).toBeVisible();
      await expect(words.getByRole('button', { name: 'Reject' })).toBeVisible();
      await expect(words.getByRole('button', { name: 'Take over' })).toBeVisible();
      const w = (await words.boundingBox())!;
      const i = (await icons.boundingBox())!;
      expect(w.x + w.width, 'the worded buttons must sit left of the icons').toBeLessThanOrEqual(
        i.x,
      );
      for (const b of await icons.getByRole('button').all()) {
        expect(await b.getAttribute('aria-label'), 'an icon-only button with no name').toBeTruthy();
        expect(await b.getAttribute('title'), 'an icon-only button with no tooltip').toBeTruthy();
      }
      // Who sent it is behind Info, not a banner or a second row.
      await icons.getByRole('button', { name: 'About this review' }).click();
      await expect(ownerPage.getByRole('dialog')).toContainText('Submitted by A member');
      await ownerPage.keyboard.press('Escape');
      await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}workspace-review-${kind}.png` });
      const reviewHeight = (await header.boundingBox())!.height;

      // The same height as the workspace's normal header for a brain item.
      const made = await brainItem(ownerApi, kind, `E2E height ${kind} ${Date.now()}`);
      try {
        const normal = detail.getByTestId('item-header');
        if (kind === 'file') {
          // A new file is found by the tree search only once it is indexed:
          // its own link opens it in the pane at once.
          await ownerPage.goto(`/files?path=files&file=${made.id}`);
          await expect(normal).toBeVisible({ timeout: 60_000 });
        } else {
          await ownerPage.goto(SCREEN[kind]);
          await openFromTree(ownerPage, `E2E height ${kind}`, normal, { timeout: 60_000 });
        }
        const normalHeight = (await normal.boundingBox())!.height;
        expect(
          Math.abs(reviewHeight - normalHeight),
          `the review header (${reviewHeight}px) is not the normal height (${normalHeight}px)`,
        ).toBeLessThanOrEqual(1);
      } finally {
        await made.remove();
      }
    });
  }

  test('a note a member shared opens read only, with Unshare, at the normal height', async ({
    ownerApi,
    ownerPage,
    serverURL,
  }) => {
    const id = '00000000-0000-4000-8000-0000000000b2';
    const title = 'E2E shared note';
    const row = {
      id,
      type: 'note',
      title,
      icon: null,
      author: { loginId: null, name: 'A member', active: true },
      updatedAt: new Date().toISOString(),
    };
    const unshares: string[] = [];
    await ownerPage.route(`${serverURL}/api/team-admin/member-items**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/team-admin/member-items')
        return json({ items: unshares.length ? [] : [row] });
      if (path === `/api/team-admin/member-items/${id}`)
        return json({ row, body: bodyOf('note', title), author: row.author });
      if (path === `/api/team-admin/member-items/${id}/unshare`) {
        unshares.push(id);
        return json({ ok: true });
      }
      return json({ error: 'not found' }, 404);
    });
    // Not waiting for approval: the review queue answers it as missing.
    await ownerPage.route(`${serverURL}/api/team-admin/submissions**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        status: path === '/api/team-admin/submissions' ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          path === '/api/team-admin/submissions'
            ? { items: [], counts: { submitted: 0, leftBehind: 0 } }
            : { error: 'Not found.' },
        ),
      });
    });

    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/notes');
    const list = ownerPage.locator('[data-testid="list"]');
    await expect(list.getByRole('region', { name: 'Waiting for approval' })).toHaveCount(0);
    const card = list
      .getByRole('region', { name: 'Shared by members' })
      .getByRole('button', { name: new RegExp(title) });
    await card.click({ timeout: 60_000 });
    await expect(card).toHaveAttribute('data-selected', 'true');
    await expect.poll(() => new URL(ownerPage.url()).searchParams.get('review')).toBe(id);

    const header = ownerPage.locator('[data-testid="detail"]').getByTestId('item-review-header');
    await expect(header.getByRole('heading', { name: title })).toBeVisible();
    const words = header.getByTestId('review-header-text-actions');
    await expect(words.getByRole('button', { name: 'Unshare' })).toBeVisible();
    // Read only: no Approve, Reject or Take over for a shared item.
    await expect(words.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await expect(words.getByRole('button', { name: 'Take over' })).toHaveCount(0);
    await header.getByRole('button', { name: 'About this item' }).click();
    await expect(ownerPage.getByRole('dialog')).toContainText('Shared with the team by A member');
    await ownerPage.keyboard.press('Escape');
    await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}workspace-shared-note.png` });
    const sharedHeight = (await header.boundingBox())!.height;

    // Unshare asks first; Cancel changes nothing.
    await words.getByRole('button', { name: 'Unshare' }).click();
    const confirm = ownerPage.getByRole('alertdialog');
    await expect(confirm).toContainText('Nothing is deleted.');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    expect(unshares).toEqual([]);
    await words.getByRole('button', { name: 'Unshare' }).click();
    await ownerPage.getByRole('alertdialog').getByRole('button', { name: 'Unshare' }).click();
    await expect(ownerPage.getByText('Unshared: only its author sees it now.')).toBeVisible();
    expect(unshares).toEqual([id]);
    await expect(list.getByRole('region', { name: 'Shared by members' })).toHaveCount(0);

    const made = await brainItem(ownerApi, 'note', `E2E height shared ${Date.now()}`);
    try {
      await ownerPage.goto('/notes');
      const normal = ownerPage.locator('[data-testid="detail"]').getByTestId('item-header');
      await openFromTree(ownerPage, 'E2E height shared', normal, { timeout: 60_000 });
      const normalHeight = (await normal.boundingBox())!.height;
      expect(Math.abs(sharedHeight - normalHeight)).toBeLessThanOrEqual(1);
    } finally {
      await made.remove();
    }
  });

  test('at phone width the review pane fits: no sideways scroll', async ({
    ownerPage,
    serverURL,
  }) => {
    const id = ID.page;
    const row = {
      id,
      type: 'page',
      title: 'E2E waiting page with a long title that has to fit a phone',
      icon: null,
      sharing: 'private',
      reviewState: 'submitted',
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reason: 'submitted',
      author: { loginId: null, name: 'A member', email: null, inactive: false, role: 'member' },
    };
    await ownerPage.route(`${serverURL}/api/team-admin/submissions**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      const body =
        path === '/api/team-admin/submissions'
          ? { items: [row], counts: { submitted: 1, leftBehind: 0 } }
          : path === `/api/team-admin/submissions/${id}`
            ? { row, body: bodyOf('page', row.title), comments: [] }
            : null;
      return route.fulfill({
        status: body ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(body ?? { error: 'not found' }),
      });
    });
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    await ownerPage.goto(`/pages?review=${id}`);
    const header = ownerPage.getByTestId('item-review-header');
    await expect(header.getByRole('button', { name: 'Approve' })).toBeVisible({ timeout: 60_000 });
    await expect(header.getByRole('button', { name: 'About this review' })).toBeVisible();
    const overflow = await ownerPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the page scrolls sideways at phone width').toBeLessThanOrEqual(0);
    // Every action is on screen: the groups wrap, nothing is cut off.
    for (const b of await header.getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.x + box.width, 'a header button is cut off').toBeLessThanOrEqual(390);
    }
    await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}workspace-review-phone.png` });
  });
});
