import { expect, test } from '../lib/fixtures';

/**
 * The settings hub: `/settings`, a route that was unclaimed until now.
 *
 * Half the settings cluster is a master-detail screen with a collection behind
 * it (accounts, agents, keys…). The other half was thirteen single panels with
 * no list at all — flat entries in a 24-item nav group, each centring itself in
 * a column no divider governed. Those thirteen are the cards here.
 *
 * `master-detail-screens.spec.ts` holds the scaffold half (panes, persisted
 * width, one scrollbar, server render). This file holds what a scaffold check
 * cannot see: a card per screen, the open one selected, clicking navigates, the
 * nav survives that navigation — and the screens' own width caps are gone.
 */

/** Every screen the hub lists, in card order. */
const SCREENS = [
  'Profile',
  'Appearance',
  'Microsoft 365',
  'Calendars',
  'Discover contacts',
  'MCP connector',
  'Embedding',
  'Local network',
  'Entities',
  'PDF passwords',
  'Backups',
  'Updates',
  'Audit log',
];

test.describe('settings hub', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  test('one card per screen, and /settings itself selects none of them', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings');

    const nav = ownerPage.locator('[data-testid="settings-nav"]');
    await expect(nav).toBeVisible();

    const cards = nav.locator('[data-testid="settings-nav-card"]');
    await expect(cards, 'a screen lost its card — or gained a second one').toHaveCount(
      SCREENS.length,
    );
    for (const [i, label] of SCREENS.entries()) {
      await expect(cards.nth(i)).toContainText(label);
    }

    // Every card explains itself. The description is the whole point of a card
    // list over a flat nav entry, so an empty one is a bug.
    for (const [i, label] of SCREENS.entries()) {
      const text = await cards.nth(i).innerText();
      expect(
        text.replace(label, '').trim().length,
        `the ${label} card carries nothing but its title`,
      ).toBeGreaterThan(10);
    }

    // `/settings` is a landing state, not a redirect to the first card: it
    // lights nothing and says to pick one. A redirect would answer a question
    // the reader has not asked, and the back button would bounce off it.
    await expect(
      nav.locator('[data-testid="settings-nav-card"][data-selected="true"]'),
      'landing on /settings pre-selected a screen',
    ).toHaveCount(0);
    await expect(ownerPage.getByText('Pick a setting on the left.')).toBeVisible();
  });

  test('clicking a card navigates, moves the selection, and keeps the nav mounted', async ({
    ownerPage,
  }) => {
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings');

    const nav = ownerPage.locator('[data-testid="settings-nav"]');
    const cards = nav.locator('[data-testid="settings-nav-card"]');
    await expect(cards.first()).toBeVisible();

    // ⚠ WAIT FOR THE HANDLE FIRST. `MasterDetail` paints a plain CSS grid until
    // `useMediaQuery` resolves, then swaps to the resizable panels — a different
    // tree, so the list subtree is rebuilt once on mount. Tagging before that
    // swap tags a node React is about to throw away, and this test then fails
    // claiming the nav remounted on navigation. It cost a debugging cycle on
    // `/debug` already.
    await expect(ownerPage.locator('[data-slot="resizable-handle"]').first()).toBeVisible();

    // Tag the live nav node. A layout-owned nav is the SAME element after a
    // client navigation; a per-page one is rebuilt and the tag goes with it.
    await nav.evaluate((el) => el.setAttribute('data-e2e-mounted', 'once'));

    await cards.filter({ hasText: 'Appearance' }).click();
    await expect(ownerPage).toHaveURL(/\/settings\/appearance$/);
    await expect(
      cards.filter({ hasText: 'Appearance' }),
      'the card for the open screen is not selected',
    ).toHaveAttribute('data-selected', 'true');
    await expect(
      nav.locator('[data-testid="settings-nav-card"][data-selected="true"]'),
      'more than one card is lit',
    ).toHaveCount(1);

    await expect(
      nav,
      'the nav remounted on navigation — is it back inside the pages instead of the layout?',
    ).toHaveAttribute('data-e2e-mounted', 'once');
    await expect(cards).toHaveCount(SCREENS.length);

    // The control, so the assertion above cannot pass by being unfalsifiable:
    // leaving the section DOES tear the layout down, and the tag must die with
    // it. A tag that survives this would say "not remounted" about anything.
    await ownerPage.goto('/tasks');
    await expect(nav).toHaveCount(0);
    await ownerPage.goto('/settings');
    await expect(cards.first()).toBeVisible();
    await expect(
      nav,
      'the tag outlived a full teardown — it is not measuring mounts at all',
    ).not.toHaveAttribute('data-e2e-mounted', 'once');
  });

  test('a sub-route keeps its parent card lit', async ({ ownerPage }) => {
    // `/settings/network/connect` is still Local network. A card list that goes
    // dark when you follow a link inside the screen reads as "you have left".
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/network/connect');

    const cards = ownerPage.locator('[data-testid="settings-nav-card"]');
    await expect(cards.first()).toBeVisible();
    await expect(cards.filter({ hasText: 'Local network' })).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  test('the screens fill the pane instead of centring in it', async ({ ownerPage }) => {
    // The half that actually answers "left-aligned, sizable content". All
    // thirteen carried an `mx-auto max-w-*` of their own, and a pane that is
    // ALREADY a measure and draggable, with a second cap inside it, leaves the
    // drag with nothing to do — the `/pages` bug, and the one just fixed in
    // `accounts` and `peers`.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings/profile');

    const detail = ownerPage.locator('[data-testid="detail"]');
    await expect(detail).toBeVisible();
    // The screen's own form: a block that fills whatever it is given, so its
    // box is a faithful reading of the measure it actually gets.
    const form = detail.locator('form').first();
    await expect(form).toBeVisible();

    const pane = (await detail.boundingBox())!;
    const content = (await form.boundingBox())!;
    // Tucked against the divider, not floated to the middle of the pane. The
    // padding is `px-6`, so allow for it and nothing more.
    expect(
      content.x - pane.x,
      'the content is centred in the pane — an inner mx-auto survived',
    ).toBeLessThan(40);

    // And widening the divider actually widens the content, which is what a
    // surviving `max-w-2xl` would silently prevent.
    const before = content.width;
    const handle = ownerPage
      .locator('[data-slot="resizable-panel-group"]:has([data-testid="list"])')
      .last()
      .locator(':scope > [data-slot="resizable-handle"]')
      .last();
    const grip = (await handle.boundingBox())!;
    await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await ownerPage.mouse.down();
    await ownerPage.mouse.move(grip.x + grip.width / 2 + 200, grip.y + grip.height / 2, {
      steps: 8,
    });
    await ownerPage.mouse.up();

    await expect
      .poll(async () => (await form.boundingBox())!.width, {
        message: 'the content ignored the divider — it is still capped from inside',
      })
      .toBeGreaterThan(before + 100);
  });
});
