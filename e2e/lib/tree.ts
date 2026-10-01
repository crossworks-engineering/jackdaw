import { expect, type Locator, type Page } from '@playwright/test';
import { clickUntilOpen } from './hydration';

/**
 * Open one item from a screen's item tree, the way a user does: search the
 * tree for it, then pick its row.
 *
 * The folder tree (docs/folder-tree.md) replaced the paged lists on a brain
 * that serves it, and it changed two things the older specs leaned on:
 *
 *  - the tree opens NOTHING by itself. The lists selected their first row on
 *    load, so `?q=<marker>` used to land on the fixture; on the tree the pane
 *    stays empty until a row is picked.
 *  - the tree's search is its own state, not the URL's `?q=`. A `?q=` is still
 *    read by the paged list a brain before the tree gets, and by nothing else.
 *
 * The search is typed until the row turns up, because a field filled a beat
 * before hydration is reset by React, and the row only exists once the
 * debounced search has come back. `name` is a substring of the row's name: a
 * task's row leads with its done box ("Not done …").
 */
export async function openFromTree(
  page: Page,
  name: string,
  opened: Locator,
  { timeout = 20_000 }: { timeout?: number } = {},
) {
  const list = page.locator('[data-testid="list"]');
  const search = list.getByRole('textbox', { name: /^Search / });
  const row = list.getByRole('treeitem', { name }).first();
  await expect(async () => {
    await search.fill(name);
    await expect(row).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout });
  await clickUntilOpen(row, opened);
}

/** A row of the item tree, found by a substring of its name. */
export function treeRow(page: Page, name: string): Locator {
  return page.locator('[data-testid="list"]').getByRole('treeitem', { name });
}
