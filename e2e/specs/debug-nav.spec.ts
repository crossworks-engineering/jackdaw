import { expect, test } from '../lib/fixtures';

/**
 * The debug section used to navigate by a horizontal strip of twelve tabs. It
 * did not fit: the strip scrolled sideways, so several tabs were always
 * off-screen, and a bare label could not say whether there was anything worth
 * opening behind it.
 *
 * It is a `MasterDetail` list of cards now — one per tab, each with what the
 * tab is for and a stat line. `master-detail-screens.spec.ts` holds the
 * scaffold half (panes, persisted width, one scrollbar, server render). This
 * file holds what a scaffold check cannot see: that there is a card per tab,
 * that clicking one navigates and marks it selected, and that the nav SURVIVES
 * that navigation instead of remounting.
 *
 * The last one is the reason the nav lives in the layout rather than in each
 * page: its stat queries mount once for the section. Put it back in the pages
 * and every tab change refires eight requests.
 */

/** Every tab the section has. Order is the reading order of the cards. */
const TABS = [
  'Overview',
  'Spend',
  'Topics',
  'Digests',
  'Facts',
  'Context',
  'Agents',
  'Telegram',
  'Journey',
  'Integrity',
  'Tool validation',
  'Sanity check',
];

test.describe('debug card nav', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('one card per tab, and the open tab is the selected one', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/debug');

    const nav = ownerPage.locator('[data-testid="debug-nav"]');
    await expect(nav).toBeVisible();

    const cards = nav.locator('[data-testid="debug-nav-card"]');
    await expect(cards, 'a tab lost its card — or gained a second one').toHaveCount(TABS.length);

    // Titles, in order. `toHaveText` on the collection asserts both.
    for (const [i, label] of TABS.entries()) {
      await expect(cards.nth(i)).toContainText(label);
    }

    // Every card explains itself. The description is the whole reason this is a
    // card list and not the tab strip it replaced, so an empty one is a bug.
    for (const [i, label] of TABS.entries()) {
      const text = await cards.nth(i).innerText();
      expect(
        text.replace(label, '').trim().length,
        `the ${label} card carries nothing but its title`,
      ).toBeGreaterThan(10);
    }

    // Landing on /debug selects Overview and NOTHING else.
    //
    // Note this is NOT where Overview's exact match earns its keep — on
    // `/debug` a prefix test picks Overview alone anyway, because `/debug`
    // does not start with `/debug/spend`. The exact match matters on the SUB
    // routes, where every sibling href starts with `/debug` and a prefix test
    // leaves Overview lit beside the open tab. The next test is the one that
    // catches that; verified by dropping the exact match and watching it fail.
    await expect(
      nav.locator('[data-testid="debug-nav-card"][data-selected="true"]'),
      'exactly one card should be selected',
    ).toHaveCount(1);
    await expect(cards.nth(0)).toHaveAttribute('data-selected', 'true');
  });

  test('clicking a card navigates, moves the selection, and keeps the nav mounted', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/debug');

    const nav = ownerPage.locator('[data-testid="debug-nav"]');
    const cards = nav.locator('[data-testid="debug-nav-card"]');
    await expect(cards.first()).toBeVisible();

    // ⚠ WAIT FOR THE HANDLE FIRST. `MasterDetail` paints a plain CSS grid until
    // `useMediaQuery` resolves, THEN swaps to the resizable panels — a
    // different tree, so the list subtree is rebuilt once on mount, by design
    // and on every ported screen. Tagging before that swap tags a node React is
    // about to throw away, and this test then fails claiming the nav remounted
    // on navigation when what remounted was MasterDetail settling. It raced:
    // green in isolation, red under a full run where the swap lands later.
    // The handle exists only in the panel branch, so it IS the "settled" signal.
    await expect(ownerPage.locator('[data-slot="resizable-handle"]').first()).toBeVisible();

    // Tag the live nav node. A layout-owned nav is the SAME element after a
    // client navigation; a per-page one is rebuilt and the tag is lost with it.
    await nav.evaluate((el) => el.setAttribute('data-e2e-mounted', 'once'));

    await cards.filter({ hasText: 'Sanity check' }).click();
    await expect(ownerPage).toHaveURL(/\/debug\/sanity$/);

    await expect(
      cards.filter({ hasText: 'Sanity check' }),
      'the card for the open tab is not selected',
    ).toHaveAttribute('data-selected', 'true');
    await expect(cards.nth(0), 'Overview stayed selected after leaving it').not.toHaveAttribute(
      'data-selected',
      'true',
    );

    await expect(
      nav,
      'the nav remounted on navigation — is it back inside the pages instead of the layout?',
    ).toHaveAttribute('data-e2e-mounted', 'once');

    // Still every tab, from the new route.
    await expect(cards).toHaveCount(TABS.length);

    // The control, so the assertion above cannot pass by being unfalsifiable:
    // leaving the section entirely DOES tear the layout down, and the tag must
    // die with it. A tag that survives this survived everything, and would say
    // "not remounted" even about a nav rebuilt on every keystroke.
    await ownerPage.goto('/tasks');
    await expect(nav).toHaveCount(0);
    await ownerPage.goto('/debug');
    await expect(cards.first()).toBeVisible();
    await expect(
      nav,
      'the tag outlived a full teardown — it is not measuring mounts at all',
    ).not.toHaveAttribute('data-e2e-mounted', 'once');
  });

  test('the cards carry a stat line, not just a label', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/debug');

    const cards = ownerPage.locator('[data-testid="debug-nav-card"]');

    // Sanity's line is the one that needs NO data behind it — it is a static
    // "this runs when you open it", said out loud so a blank line under that
    // card doesn't read as "nothing to report". It is therefore the only stat
    // assertable on a brain with an empty corpus.
    await expect(cards.filter({ hasText: 'Sanity check' })).toContainText('runs its checks');

    // The data-backed ones need a brain that has answered at least one request.
    // Overview's counter is the cheapest of those: /api/debug/overview reports
    // 0 traces rather than failing on an empty box, so the line renders either
    // way and only its NUMBER depends on traffic.
    await expect(cards.nth(0)).toContainText(/traces|no traces/);
  });
});
