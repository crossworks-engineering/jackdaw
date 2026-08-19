import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../lib/fixtures';

/**
 * `/pages` used to render the hierarchy as a TREE of one-line rows: a grip in a
 * left gutter, a chevron indented by depth, a truncated title, and three
 * hover-revealed icon buttons on the right. Two things were wrong with it. The
 * chrome ate the title, so a page was hard to find; and a tree cannot be paged
 * — page 2 of a tree cuts a branch in half — so the list shipped the whole
 * corpus with no pager at all.
 *
 * Drill-down is the fix for both. The column shows ONE LEVEL at a time, which
 * makes every view a flat list of cards that pages like `/traces` does, and the
 * card gives the title the full width with its controls moved to a footer row.
 *
 * This spec is the guard for the parts a scaffold check cannot see: that the
 * title WRAPS rather than truncates (CSS truncation leaves the text in the DOM,
 * so only geometry proves it), that the controls sit BELOW it, that a click
 * both previews and drills, and that the pager pages a level.
 */

const LIST = '[data-testid="list"]';

/** `MasterDetail` swaps from a CSS grid to real panels on mount. Anything that
 *  measures or clicks the list before that swap is racing a remount. */
async function listReady(page: Page) {
  await expect(page.locator('[data-slot="resizable-handle"]').first()).toBeVisible({
    timeout: 15_000,
  });
  return page.locator(LIST);
}

type Created = { id: string; title: string };

async function makePage(
  api: APIRequestContext,
  title: string,
  parentId?: string,
): Promise<Created> {
  const res = await api.post('/api/pages', { data: { title, ...(parentId ? { parentId } : {}) } });
  expect(res.ok(), `could not create “${title}”`).toBeTruthy();
  const { page: row } = (await res.json()) as { page: { id: string } };
  return { id: row.id, title };
}

test.describe('pages drill-down', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('a card gives the title the full width and puts its controls underneath', async ({
    ownerApi,
    ownerPage,
  }) => {
    const stamp = Date.now();
    // Long enough that a ~300px column cannot fit it on one line — this is the
    // whole point of the assertion below.
    const childTitle = `E2E a deliberately long sub-page title that has to wrap onto more than one line ${stamp}`;
    const parent = await makePage(ownerApi, `E2E drill parent ${stamp}`);

    try {
      const child = await makePage(ownerApi, childTitle, parent.id);
      await makePage(ownerApi, `E2E grandchild ${stamp}`, child.id);

      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/pages?parent=${parent.id}`);
      const list = await listReady(ownerPage);

      const title = list.getByText(childTitle, { exact: true });
      await expect(title).toBeVisible({ timeout: 15_000 });

      // 1. The title WRAPS. A truncated title is exactly one line tall; the DOM
      //    text is identical either way, so only the box tells them apart.
      const titleBox = (await title.boundingBox())!;
      expect(
        titleBox.height,
        `the title is ${Math.round(titleBox.height)}px tall — one line, so it is truncating again`,
      ).toBeGreaterThan(28);

      // 2. The card says how many children it has.
      await expect(list.getByText('1 sub-page', { exact: true })).toBeVisible();

      // 3. The controls are BELOW the title, not inline beside it.
      const del = list.getByRole('button', { name: 'Delete page' }).first();
      await expect(del).toBeVisible();
      await expect(list.getByRole('button', { name: 'Add sub-page' }).first()).toBeVisible();
      await expect(list.getByRole('button', { name: 'Move page' }).first()).toBeVisible();
      const delBox = (await del.boundingBox())!;
      expect(
        delBox.y,
        'the delete button is level with the title — the controls are inline again',
      ).toBeGreaterThan(titleBox.y + titleBox.height - 4);
    } finally {
      expect((await ownerApi.delete(`/api/pages/${parent.id}`)).ok()).toBeTruthy();
    }
  });

  test('clicking a parent previews it AND drills the list into its children', async ({
    ownerApi,
    ownerPage,
  }) => {
    const stamp = Date.now();
    const parent = await makePage(ownerApi, `E2E drill parent ${stamp}`);

    try {
      const child = await makePage(ownerApi, `E2E drill child ${stamp}`, parent.id);
      const grandchild = await makePage(ownerApi, `E2E drill grandchild ${stamp}`, child.id);

      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/pages?parent=${parent.id}`);
      const list = await listReady(ownerPage);

      await list.getByText(child.title, { exact: true }).click();

      // Drilled: the column now shows the CHILD'S children.
      await expect(list.getByText(grandchild.title, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(ownerPage).toHaveURL(new RegExp(`parent=${child.id}`));
      // …and the same click previewed the page it drilled into.
      await expect(
        ownerPage.locator('[data-testid="detail"]').getByText(child.title).first(),
      ).toBeVisible();

      // The breadcrumb names the level it returns to, and goes there.
      const back = list.getByRole('button', { name: `Back to ${parent.title}` });
      await expect(back).toBeVisible();
      await back.click();
      await expect(list.getByText(child.title, { exact: true })).toBeVisible();
      await expect(ownerPage).toHaveURL(new RegExp(`parent=${parent.id}`));
    } finally {
      expect((await ownerApi.delete(`/api/pages/${parent.id}`)).ok()).toBeTruthy();
    }
  });

  test('a level paginates, and ?parent=…&page=2 survives a reload', async ({
    ownerApi,
    ownerPage,
  }) => {
    const stamp = Date.now();
    const parent = await makePage(ownerApi, `E2E paging parent ${stamp}`);

    try {
      // LEVEL_PAGE_SIZE is 25, so 26 children is the smallest set that pages.
      // Serial on purpose: the list sorts by last-edited and a burst of
      // parallel writes gives 26 pages the same timestamp.
      for (let i = 1; i <= 26; i++) {
        await makePage(
          ownerApi,
          `E2E paged child ${String(i).padStart(2, '0')} ${stamp}`,
          parent.id,
        );
      }

      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/pages?parent=${parent.id}`);
      const list = await listReady(ownerPage);

      // The footer counts THIS LEVEL, not the corpus.
      await expect(list.getByText('26 pages', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(list.getByText('1 / 2', { exact: true })).toBeVisible();

      await list.getByRole('button', { name: 'Next page' }).click();
      await expect(list.getByText('2 / 2', { exact: true })).toBeVisible();
      await expect(ownerPage).toHaveURL(new RegExp(`parent=${parent.id}`));
      await expect(ownerPage).toHaveURL(/page=2/);

      // Page 2 of 26 at 25 per page holds exactly one card.
      const onPageTwo = await list.locator('[data-mark-kind="page"]').count();
      expect(onPageTwo, 'page 2 should hold the 26th child alone').toBe(1);

      // The URL is the state — a reload lands back on the same level and page.
      await ownerPage.reload();
      await listReady(ownerPage);
      await expect(list.getByText('2 / 2', { exact: true })).toBeVisible({ timeout: 15_000 });
      expect(await list.locator('[data-mark-kind="page"]').count()).toBe(1);
    } finally {
      expect((await ownerApi.delete(`/api/pages/${parent.id}`)).ok()).toBeTruthy();
    }
  });

  test('searching leaves the drill-down — a hit list spans levels', async ({
    ownerApi,
    ownerPage,
  }) => {
    const stamp = Date.now();
    const parent = await makePage(ownerApi, `E2E search parent ${stamp}`);

    try {
      const child = await makePage(ownerApi, `E2E search child ${stamp}`, parent.id);

      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/pages?parent=${parent.id}`);
      const list = await listReady(ownerPage);
      await expect(list.getByRole('button', { name: `Back to all pages` })).toBeVisible({
        timeout: 15_000,
      });

      await list.getByPlaceholder('Search pages…').fill(child.title);

      // The parent is dropped from the URL and the breadcrumb goes with it.
      await expect(ownerPage).not.toHaveURL(/parent=/, { timeout: 15_000 });
      await expect(list.getByRole('button', { name: /^Back to / })).toHaveCount(0);
      await expect(list.getByText(child.title, { exact: true })).toBeVisible();
    } finally {
      expect((await ownerApi.delete(`/api/pages/${parent.id}`)).ok()).toBeTruthy();
    }
  });

  test('the Details switch adds summaries and tags, and is remembered', async ({
    ownerApi,
    ownerPage,
  }) => {
    const stamp = Date.now();
    const tag = `e2e-density-${stamp}`;
    // Tags, not the summary: a tag is settable at create time, where `summary`
    // is derived from the body server-side and would make this spec depend on
    // how that derivation works.
    const title = `E2E density ${stamp}`;
    const res = await ownerApi.post('/api/pages', { data: { title, tags: [tag] } });
    expect(res.ok()).toBeTruthy();
    const { page: row } = (await res.json()) as { page: { id: string } };

    try {
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/pages?q=${encodeURIComponent(title)}`);
      const list = await listReady(ownerPage);

      const card = list.getByText(title, { exact: true });
      await expect(card).toBeVisible({ timeout: 15_000 });

      // Details are OFF by default — the column is for finding a page, so a
      // card opens as its title plus its controls and nothing else.
      await expect(
        list.getByText(tag, { exact: true }),
        'tags are showing before the switch was touched — the default flipped back on',
      ).toHaveCount(0);

      const density = list.getByRole('switch', { name: 'Show summaries and tags on cards' });
      await expect(density).toBeVisible();
      await density.click();

      // On: the tag appears, and the title and footer controls are still there.
      await expect(list.getByText(tag, { exact: true })).toBeVisible();
      await expect(card).toBeVisible();
      await expect(list.getByRole('button', { name: 'Delete page' }).first()).toBeVisible();

      // It is a preference, not a query — it survives a reload and stays out of
      // the URL, which is what stops it being pasted into a shared link.
      await ownerPage.reload();
      await listReady(ownerPage);
      await expect(list.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(list.getByText(tag, { exact: true })).toBeVisible();
      await expect(ownerPage).not.toHaveURL(/details/);

      // Back to the default, so a shared browser profile does not carry this
      // into the next spec that measures a card.
      await list.getByRole('switch', { name: 'Show summaries and tags on cards' }).click();
      await expect(list.getByText(tag, { exact: true })).toHaveCount(0);
    } finally {
      expect((await ownerApi.delete(`/api/pages/${row.id}`)).ok()).toBeTruthy();
    }
  });

  test('dragging one card onto another re-parents it', async ({ ownerApi, ownerPage }) => {
    const stamp = Date.now();
    const parent = await makePage(ownerApi, `E2E drag parent ${stamp}`);

    try {
      const a = await makePage(ownerApi, `E2E drag source ${stamp}`, parent.id);
      const b = await makePage(ownerApi, `E2E drag target ${stamp}`, parent.id);

      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(`/pages?parent=${parent.id}`);
      const list = await listReady(ownerPage);
      await expect(list.getByText(a.title, { exact: true })).toBeVisible({ timeout: 15_000 });

      const grip = list.getByRole('button', { name: `Drag to move “${a.title}”` });
      const target = list.getByText(b.title, { exact: true });
      const from = (await grip.boundingBox())!;
      const to = (await target.boundingBox())!;

      // dnd-kit's PointerSensor arms at 6px and tracks pointermove, so the drag
      // has to be several real moves — a single jump never starts it.
      await ownerPage.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await ownerPage.mouse.down();
      await ownerPage.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, {
        steps: 6,
      });
      await ownerPage.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await ownerPage.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 2, { steps: 4 });
      await ownerPage.mouse.up();

      // Assert through the API, not the DOM. A synthetic drag that never
      // registers leaves the tree untouched and a DOM-only check goes green.
      await expect
        .poll(
          async () => {
            const res = await ownerApi.get('/api/pages');
            const { pages } = (await res.json()) as {
              pages: { id: string; parentId: string | null }[];
            };
            return pages.find((p) => p.id === a.id)?.parentId ?? null;
          },
          { timeout: 15_000, message: 'the dragged page never re-parented' },
        )
        .toBe(b.id);
    } finally {
      expect((await ownerApi.delete(`/api/pages/${parent.id}`)).ok()).toBeTruthy();
    }
  });
});
