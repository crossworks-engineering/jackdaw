import { expect, test } from '../lib/fixtures';
import { ARTIFACTS_DIR } from '../lib/env';

/**
 * The scaffold half of phase 2, asserted once for every ported screen instead of
 * copy-pasted into seven files.
 *
 * `events`, `contacts`, `journal`, `secrets` and `formulas` have their own specs
 * because the port changed real behaviour there (validation, saving, the
 * composer). `models`, `runs` and `sandboxes` were pure scaffold swaps — no
 * form, no new validation — so what is worth holding is exactly what this table
 * holds: the panes exist, the width is remembered per screen, and the pane owns
 * the only scrollbar.
 *
 * Adding a screen to `SCREENS` is the whole cost of covering the next port.
 */

const SCREENS = [
  { path: '/tasks', id: 'tasks' },
  { path: '/events', id: 'events' },
  { path: '/contacts', id: 'contacts' },
  { path: '/journal', id: 'journal' },
  { path: '/secrets', id: 'secrets' },
  { path: '/models', id: 'models' },
  { path: '/runs', id: 'runs' },
  { path: '/formulas', id: 'formulas' },
  // A box with the `sandboxes` compose profile off renders an explainer instead
  // of the screen, so this row SKIPS itself there rather than failing. Said out
  // loud, because a silently-skipped row is indistinguishable from a passing one.
  { path: '/sandboxes', id: 'sandboxes', needsFeature: /Sandboxes are not enabled/ },
] as const;

test.describe('ported master-detail screens', () => {
  test.skip(({ topology }) => topology === 'same-origin', 'owner UI lives on the client app');

  for (const screen of SCREENS) {
    test(`${screen.path} is a real MasterDetail with a persisted width`, async ({ ownerPage }) => {
      // Explicit, not `test.use`: `ownerPage` comes from a hand-built context
      // (the split topology seeds a bearer into it), which does not read the
      // fixture's viewport option. Wide enough that widening the detail has
      // somewhere to come from.
      await ownerPage.setViewportSize({ width: 1600, height: 900 });
      await ownerPage.goto(screen.path);

      const list = ownerPage.locator('[data-testid="list"]');

      const off = 'needsFeature' in screen ? screen.needsFeature : null;
      if (off) {
        // Wait for the screen to SETTLE before deciding: it renders a spinner
        // first, and checking immediately after `goto` finds neither the panes
        // nor the explainer and falls through to a confusing failure.
        const explainer = ownerPage.getByText(off);
        await expect(list.or(explainer).first()).toBeVisible();
        if ((await explainer.count()) > 0) {
          test.skip(true, `${screen.path} is disabled on this box — nothing to port-check`);
        }
      }
      const detail = ownerPage.locator('[data-testid="detail"]');
      await expect(list, 'no list panel — still a hand-written grid?').toBeVisible();
      await expect(detail).toBeVisible();

      // Exactly one scrollbar in the detail pane: MasterDetail's own. A pane
      // that keeps its old `h-full overflow-y-auto` nests a second.
      const scrollers = await detail.evaluate(
        (pane) =>
          Array.from(pane.querySelectorAll('*')).filter((el) => {
            const s = getComputedStyle(el);
            return (
              (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight
            );
          }).length,
      );
      expect(scrollers, 'the detail pane should have at most one scrollbar').toBeLessThanOrEqual(1);

      // The layout is saved under this screen's OWN key, so two screens cannot
      // share a width. Written only after a real interaction, hence the drag.
      const before = (await detail.boundingBox())!;
      const handle = ownerPage.locator('[data-slot="resizable-handle"]').last();
      const grip = (await handle.boundingBox())!;
      await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await ownerPage.mouse.down();
      await ownerPage.mouse.move(grip.x + grip.width / 2 + 100, grip.y + grip.height / 2, {
        steps: 8,
      });
      await ownerPage.mouse.up();
      const dragged = (await detail.boundingBox())!;
      expect(Math.abs(dragged.width - before.width), 'the divider did not move').toBeGreaterThan(
        20,
      );

      const key = await ownerPage.evaluate(
        (id) =>
          Object.keys(window.localStorage).find(
            (k) => k.includes('master-detail') && k.includes(id),
          ) ?? null,
        screen.id,
      );
      expect(key, `no saved layout under a key naming "${screen.id}"`).toBeTruthy();

      await ownerPage.reload();
      await expect
        .poll(async () => Math.abs((await detail.boundingBox())!.width - dragged.width))
        .toBeLessThan(3);
    });
  }

  test('every screen keeps its own width, not a shared one', async ({ ownerPage }) => {
    // The persistence key is per-screen on purpose: a Kanban board wants far
    // more room than a 340px contact list, so one shared width would be wrong
    // on both. Two screens dragged differently must stay different.
    await ownerPage.setViewportSize({ width: 1600, height: 900 });
    await ownerPage.goto('/contacts');
    const detail = ownerPage.locator('[data-testid="detail"]');
    await expect(detail).toBeVisible();
    const contactsWidth = (await detail.boundingBox())!.width;

    const handle = ownerPage.locator('[data-slot="resizable-handle"]').last();
    const grip = (await handle.boundingBox())!;
    await ownerPage.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await ownerPage.mouse.down();
    await ownerPage.mouse.move(grip.x + grip.width / 2 + 140, grip.y + grip.height / 2, {
      steps: 8,
    });
    await ownerPage.mouse.up();
    const widened = (await detail.boundingBox())!.width;
    expect(widened).toBeGreaterThan(contactsWidth + 60);

    await ownerPage.goto('/models');
    await expect(detail).toBeVisible();
    expect(
      Math.abs((await detail.boundingBox())!.width - widened),
      'models inherited the width dragged on contacts — shared key?',
    ).toBeGreaterThan(3);
    await ownerPage.screenshot({ path: `${ARTIFACTS_DIR}master-detail-per-screen.png` });
  });
});
