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

  test('five cards carry a live stat line, and the other eight do not', async ({ ownerPage }) => {
    // A stat earns its place when it is ACTIONABLE — something worth knowing
    // before deciding whether to open the screen. Five of the thirteen have
    // such a reading; a line under Profile saying "you have a profile" would be
    // noise, and it would also be eight more requests fired by opening
    // /settings.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/settings');

    const cards = ownerPage.locator('[data-testid="settings-nav-card"]');
    await expect(cards.first()).toBeVisible();

    const statOf = (label: string) =>
      cards.filter({ hasText: label }).locator('[data-testid="settings-nav-stat"]');

    // Each of these renders from something the brain always has an answer for,
    // however empty the box: a version string, a candidate count, an on/off
    // flag. Only the NUMBERS depend on what is configured.
    await expect(statOf('Updates')).toContainText(/\d+\.\d+/);
    await expect(statOf('Entities')).toContainText(/merge candidate|nothing to review/);
    await expect(statOf('MCP connector')).toContainText(/^(on ·|off)/);
    await expect(statOf('Backups')).toContainText(/last backup|never run yet|no scheduled backups/);
    await expect(statOf('Local network')).not.toHaveCount(0);

    // Five, and only five. Every extra one is another request fired by merely
    // opening /settings.
    await expect(
      ownerPage.locator('[data-testid="settings-nav-stat"]'),
      'a card gained or lost a stat line',
    ).toHaveCount(5);
    await expect(statOf('Profile')).toHaveCount(0);
  });

  test('the sidebar offers Settings once, and none of the screens it holds', async ({
    ownerPage,
  }) => {
    // The sidebar listed all twenty-four settings screens beside a hub that
    // lists thirteen of them. `lib/settings-hub-nav.ts` collapses those thirteen
    // into one row AT RENDER — the list itself is defined in a mantle-built
    // package and cannot be edited from this repo.
    await ownerPage.setViewportSize({ width: 1600, height: 1100 });
    await ownerPage.goto('/settings/profile');
    const rail = ownerPage.locator('nav[aria-label="Primary"]');
    await expect(rail).toBeVisible();

    // The row's first line is its label; the rest is a stat or a badge.
    const names = await rail.locator('a').allInnerTexts();
    const rows = names.map((t) => (t.split('\n')[0] ?? '').trim());

    expect(
      rows.filter((r) => r === 'Settings'),
      'the hub row is missing or doubled',
    ).toHaveLength(1);
    // ⚠ `discover` is NOT collapsed: it lives in the REVIEW group, and a first
    // version of the collapse keyed off "any /settings/ href" and put a second
    // Settings row at the top of Review because of it.
    expect(rows, 'Discover was collapsed — it belongs to Review').toContain('Discover');
    // The collection screens keep their own rows.
    for (const keep of ['Accounts', 'Agents']) {
      expect(rows, `${keep} should still have its own entry`).toContain(keep);
    }
  });

  test('one row lights, and it is the most specific one', async ({ ownerPage }) => {
    // "Settings" at `/settings` is a prefix of every other settings route, so
    // the old per-item test would light it alongside Agents on
    // `/settings/agents`. And `/settings/profile` has no row of its own any
    // more, so it has to fall through to the hub rather than lighting nothing.
    await ownerPage.setViewportSize({ width: 1600, height: 1100 });
    const rail = ownerPage.locator('nav[aria-label="Primary"]');
    for (const [path, expected] of [
      ['/settings/profile', 'Settings'],
      ['/settings/agents', 'Agents'],
      ['/settings', 'Settings'],
    ] as const) {
      await ownerPage.goto(path);
      await expect(rail).toBeVisible();
      const lit = rail.locator('a.bg-sidebar-accent');
      await expect(lit, `${path} lit more than one row`).toHaveCount(1);
      await expect(lit).toContainText(expected);
    }
  });

  test('⌘K still finds a screen the sidebar no longer lists', async ({ ownerPage }) => {
    // This is the whole argument for collapsing in the CONSUMER rather than
    // deleting the items upstream: `ALL_NAV_ITEMS` is untouched, so the command
    // palette still finds "Backups" by name even though no sidebar row says it.
    await ownerPage.setViewportSize({ width: 1600, height: 1100 });
    await ownerPage.goto('/settings');
    await ownerPage.keyboard.press('Meta+k');
    const dialog = ownerPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await ownerPage.keyboard.type('backups');
    await expect(
      dialog.getByRole('option', { name: /Backups/i }).first(),
      'the palette lost a screen the sidebar stopped listing',
    ).toBeVisible();
  });

  test('the screens keep real padding against the divider', async ({ ownerPage }) => {
    // The other half of dropping the `mx-auto max-w-*` caps: the centring used
    // to supply the visual gap, so a screen whose own padding was `p-1` (or
    // absent) went flush against the divider the moment it stopped being
    // centred. `embedding` was 4px and `appearance` was 0.
    //
    // Measured as the gap between the pane's left edge and the first block of
    // content — NOT the pane's `firstElementChild`, which is `MasterDetail`'s
    // own scroll wrapper and is unpadded by design. (A first version of this
    // test read that wrapper and failed at 0 with the padding correctly in
    // place.) The locator also waits out the loading spinner for free: these
    // screens render one before their data arrives, and it has no section.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    for (const path of ['/settings/embedding', '/settings/appearance']) {
      await ownerPage.goto(path);
      const pane = ownerPage.locator('[data-testid="detail"]');
      await expect(pane).toBeVisible();
      const content = pane.locator('section, header, form').first();
      await expect(content).toBeVisible();
      const paneBox = (await pane.boundingBox())!;
      const contentBox = (await content.boundingBox())!;
      expect(
        contentBox.x - paneBox.x,
        `${path} is flush against the divider`,
      ).toBeGreaterThanOrEqual(16);
    }

    // `audit` is the one screen built as a full-height table rather than a
    // column of sections, so it has no `section`/`header`/`form` to measure and
    // it was full-bleed until Jason asked for it to match. Its three regions —
    // filter bar, table, pager — each get the same 24px, while the rules
    // between them still span the pane as dividers should.
    await ownerPage.goto('/settings/audit');
    const auditPane = ownerPage.locator('[data-testid="detail"]');
    await expect(auditPane.locator('th').first()).toBeVisible();
    const auditBox = (await auditPane.boundingBox())!;
    for (const [region, selector] of [
      ['filter bar', 'label'],
      ['table', 'th'],
      ['pager', 'span.tabular-nums'],
    ] as const) {
      const el = auditPane.locator(selector).first();
      const box = (await el.boundingBox())!;
      expect(box.x - auditBox.x, `audit's ${region} is not inset`).toBeGreaterThanOrEqual(16);
    }
  });

  test('the detail can be dragged out to the full window, not a 1100px cap', async ({
    ownerPage,
  }) => {
    // `appearance` is a gallery — ~40 theme swatches in a narrow aside and ~34
    // avatar styles beside it — and at the 672px opening measure both are
    // cramped while an empty spacer holds several hundred px of the window.
    // `maxDetailSize="100%"` lets the drag run that spacer down to nothing, so
    // the ceiling is the window (minus the rail and the Activity column) rather
    // than `MasterDetail`'s 1100px default.
    await ownerPage.setViewportSize({ width: 1920, height: 1080 });
    await ownerPage.goto('/settings/appearance');
    const detail = ownerPage.locator('[data-testid="detail"]');
    await expect(detail).toBeVisible();

    const handle = ownerPage
      .locator('[data-slot="resizable-panel-group"]:has([data-testid="list"])')
      .last()
      .locator(':scope > [data-slot="resizable-handle"]')
      .last();
    const grip = (await handle.boundingBox())!;
    await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await ownerPage.mouse.down();
    await ownerPage.mouse.move(1900, grip.y + grip.height / 2, { steps: 12 });
    await ownerPage.mouse.up();

    await expect
      .poll(async () => (await detail.boundingBox())!.width, {
        message: 'the detail stopped short — is maxDetailSize back at its 1100px default?',
      })
      .toBeGreaterThan(1150);
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
