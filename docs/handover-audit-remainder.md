# Handover: what is left of the frontend audit

Current at **v0.6.90**, on main, pushed, green and released. Everything below
is open unless it says otherwise, and what is closed lives in the audit
rather than here.

> **Start here in a fresh session.** Read §11 first — it is the shortest path
> back in, and it says what each remaining item needs before it can move.

- **The audit** is the authority and is current:
  <https://claude.ai/code/artifact/216dc6be-2285-424f-bc90-72ed7410942e>
- Companions: `docs/handover-frontend-audit.md` (the rollout and its landmines),
  `docs/handover-structure.md` (the structure pass), `docs/handover-verification.md`
  (the signed-in rig).

**Where it stands.** Every bug in the audit's §1 is closed down to two
half-findings, both remaining High items are done, raw form controls went
188 → 13 (every raw `<button>` in the repo is gone), **no dependency major is
open**, and both of §4's named performance items are closed — one of them by
measuring it and finding there was nothing there. 536 → 678 unit tests.
Everything landed was verified in a signed-in browser; §9 and §§12–14 record
what was measured and how.

**Released, six times on 2026-09-14** — v0.6.82, v0.6.84, v0.6.87, v0.6.88,
v0.6.89, v0.6.90 — each tagged, published, set `Latest` and rolled to the dev
box, which now runs client **v0.6.90** against server **v0.232.183**. Five went
out clean; **v0.6.88 was a same-day fix for a regression v0.6.87 shipped**, and
how that got through is the most useful thing in this document (§3).

**What is left needs something a session cannot bring**: a throwaway brain, or a
per-form decision. §11 is the map.

:::warning
**The recurring lesson from this round, in one line: a green check is not a
verified change.** Typecheck, 678 tests, a production build and a look at the
screen all passed while the table grid sorted by the wrong comparator. Six
separate probes returned confident, wrong answers — listed where each bit, in
§§3, 12, 13 and 14. Prove the instrument before you believe a quiet result, and
measure the effect rather than the system's opinion of itself.
:::

---

## 0. The release pipeline · fixed and shipped, v0.6.79

**Resolved.** `v0.6.79` is published and is Latest, carrying all eleven desktop
artifacts in one release; the two broken `v0.6.78` drafts are deleted. The
`v0.6.78` tag survives as history, which is the norm here — 50 tags, 5 published
releases.

**What was wrong.** `desktop.yml` ran a three-OS matrix and each job let
`electron-builder --publish always` create the draft. Creating a draft is not
idempotent by tag, so the jobs raced and `v0.6.78` came out as two drafts with
the artifacts split across them.

**The harm, stated precisely** — an earlier draft of this file said "an updater
manifest pointing at assets that are not there", which was wrong. Each manifest
did sit with its own artifacts. The real damage was that publishing either draft
ships **only a subset of platforms**: draft B had no `latest-linux.yml` at all,
so Linux clients would simply never see the update. Plus one orphaned mac
`zip.blockmap`, separated from its `.zip`, which degrades a delta update to a
full download.

**The fix**, in `desktop.yml`: a `draft` job creates the release once and the
matrix `needs` it — not for artifacts, for the ordering. It reuses an existing
release, so re-running the workflow cannot add another. **Verified in the
pipeline, not just in review:** on the `v0.6.79` run the `draft` job completed
before any builder started, and exactly one release carried the tag where
`v0.6.78` had two.

**Confirmed again on v0.6.82** (2026-09-14): exactly one draft carried the tag,
with all eleven artifacts, all three updater manifests and every blockmap beside
its own file. The `draft` job is holding.

**Still open on the same file:** `desktop.yml` and `release.yml` pin the
deprecated action line (§7). Deliberately NOT bundled with the race fix —
neither is testable without cutting a tag, and landing both together would give
a broken next release two candidate causes.

**A check worth adding to the release habit:** after publishing, confirm the
release actually became _Latest_. `PATCH draft=false` with `make_latest` in the
same call did not take on `v0.6.79`, and `v0.6.67` kept the flag — which is what
`electron-updater` reads. It needed a second explicit PATCH. See §8.

## 1. Raw form controls · 188 → 0 · done 2026-09-15

**Every raw `<button>` is gone**, `table-grid` included — 171 across 66 files.
**The cap is at 0 and the rule is `error`** as of v0.6.97; the last thirteen
FIELD elements went in that landing — see §15 for what each one took.

**The kit was the blocker, not the call sites.** Measuring the 188 before
converting any showed 57 with nowhere to go, so two things were added first and
both are in the style guide's twins table:

- **`RowButton`** (`@mantle/web-ui/ui/row-button`) — a clickable row: list item,
  disclosure header, menu item, tag chip, card target, inline text button. The
  interaction contract with no box. It absorbed the large majority.
- **The 24px chip rung**, `2xs` and `icon-2xs`. 46 call sites had improvised
  `px-2 py-1` and `p-1`/`p-0.5` because `xs` at 32px is taller than the chips
  around them.

**The rule for choosing**, which held all the way down: if the site sets a box
that matches a twin, use the twin; if it sets no box at all, use `RowButton` —
giving a 16px padding-less icon a 24px twin moves everything around it.

### What is left, and why each is not a sweep

|                       | n      | needs                                                                                                                                                                                                                                                                    |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~`table-grid`~~      | ~~12~~ | **Done 2026-09-14** — the dev brain has tables now (7 workbooks), which is what unblocked it. Eight buttons took `RowButton`/`Button`, the expanded-cell editor took `Textarea`, and three chrome-less fields kept a raw element behind a sanctioned disable. See below. |
| ~~native `<select>`~~ | ~~6~~  | **Done 2026-09-15** — all six took `Select`. The `name=` row was wrong twice over: it is TWO, not three, and Radix _does_ forward a `name`. Both still submit through a hidden input, for a better reason — see §15.                                                     |
| ~~radio / checkbox~~  | ~~4~~  | **Done 2026-09-15** — three heartbeats radios became one `RadioGroup` each; the folder checkbox took `Checkbox`, and its `name`/`value` turned out to be dead.                                                                                                           |
| ~~inline fields~~     | ~~3~~  | **Done 2026-09-15** — the tab rename took the new `Input size="xs"`; the two whose box belongs to their wrapper kept a raw element behind a sanctioned disable.                                                                                                          |

**Done:** the count is zero, the cap is zero and the rule is `error`. The cap
only ever falls; never raise it.

**Habit from this pass:** convert screen by screen and measure the geometry, not
the diff. Conversions are supposed to change nothing visible — the assistant's
toolbar was 32×32 before and after — so what to watch for is a control that
**collapses** when a primitive stops supplying its box. A DOM query, not a look.

## 2. One green `pnpm e2e` · GREEN

**Done.** First measured on 2026-09-15 at **135/161**; **146/162** at v0.6.93
after ten fixes; **161/162 at v0.6.97** (two full runs) and **163/164 at
v0.6.99**, where §16's `radio-arrow-selection.spec.ts` added the two extra. The
remaining 1 is a SKIP, not a failure. Read the denominator, not just the
numerator — the suite grows, so "161 passed" stops meaning green the moment
somebody adds a spec. The blocker was never this repo — see `e2e/README.md` for the
throwaway-brain recipe, which takes minutes, and for the two environment traps
that made this look like an app failure: the hermetic stack the old docs pointed
at exists in NEITHER repo, and Playwright's browsers were simply not installed,
which failed 151 tests in 2ms each and read exactly like a broken app.

⚠ **The suite creates and deletes content.** A throwaway brain, never one
anybody relies on.

Once green, CI picks it up on its own: the Playwright job in `verify.yml` runs
whenever the repository variable `E2E_SERVER_URL` is set, and is skipped rather
than failing until then. **Setting that variable is what makes this stick** —
this suite rotted precisely because nothing ran it.

### What the ten fixes were, because the ratio is the point

ONE was a product bug (`/tables`, §6). The other nine were the net itself having
rotted while nothing could run it: four specs found the composer by its utility
classes and stopped matching the day the shell went translucent (`bg-card` →
`bg-card/70` — a different class token), and six clicked "New" before React had
hydrated, so the click was swallowed and the form never opened. **Assume a
failure in a suite that has not run is the suite, until the code says otherwise.**

### The remaining 15, triaged

| n   | what                                                                                                                   | read                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | `shell-layout` — nav rail restores 280px where 288px was dragged; a separator counted when 0 expected                  | the width one is **FLAKY** (passed 3/3 on repeat, fails most full runs); prime suspect is v0.6.80's commit-on-release drag                                                                               |
| 4   | MasterDetail geometry — `/models` double scrollbar, `/notes` divider, `/settings/appearance` divider, `journal` detail | unknown; the divider ones may share a cause                                                                                                                                                              |
| 2   | `pages-editor-width`, `pages-reading-width` — MeasurePane missing, prose not hugging                                   | unknown                                                                                                                                                                                                  |
| 2   | `draws-crud` — shared page serves inline `<svg>` where the spec wants an image                                         | looks real                                                                                                                                                                                               |
| 2   | `pages-drilldown` — Details switch not visible; drag never re-parents                                                  | looks real                                                                                                                                                                                               |
| 2   | `team`, `team-reader` — token placeholder never appears; inline reader visible when expected hidden                    | unknown                                                                                                                                                                                                  |
| 1   | `focus-mode` — "a handle survived the collapse"                                                                        | **SPEC BUG.** It counts every `resizable-handle`, and the SPACER's always renders — which is why it passes on `/draw` and `/pages` (no spacer, they use `listFills`/`detailFills`) and fails on `/notes` |

**Verify anything you fix here by repetition, not by one green run.** A race
reads as a flake and a flake reads as noise: one skills test passed 1 of 6 runs
and was dismissed as flaky three times before the flake turned out to BE the bug.
`--repeat-each=3` is the cheap guard.

## 3. Dependency decisions · three of the five are not decisions

**Checked 2026-09-14.** Three of the five majors are blocked upstream, so there
is nothing to decide on them yet. The other two are genuinely available.

| Package                 | At         | Note                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite` (desktop)        | 7.x        | ⛔ **Blocked.** `electron-vite` 5.0.0, the latest, peers `vite ^5 \|\| ^6 \|\| ^7`. Vite 8 is not adoptable until electron-vite widens that. Nothing to decide.                                                                                                                                                                 |
| `typescript`            | 5.9.3      | ⛔ **7 is blocked, but 6 is not.** `typescript-eslint` 8.70.0 peers `typescript >=4.8.4 <6.1.0`, so TS 7 would take the parser out. **TypeScript 6.0.3 exists and is inside that range** — the real next step is 6, not 7, and the old table listing only 7.x as "latest" hid that. TS 7 (one release) can wait for the parser. |
| `vitest`                | 4.1.11     | ⏸ **Wait, unchanged.** 5.0.0 is still the ONLY stable 5.x. The original advice to wait a point release has not been overtaken.                                                                                                                                                                                                  |
| `electron`              | **44.3.0** | ✅ **Done 2026-09-14.** Chromium 150 → 152, V8 15.0 → 15.2, Node stays on 24. Updater exercised locally as far as it goes — see below.                                                                                                                                                                                          |
| `@tanstack/react-table` | **9.2.4**  | ✅ **Done 2026-09-14**, via the legacy entrypoint — see below.                                                                                                                                                                                                                                                                  |

**react-table 9 · done, natively.** Landed in two steps on purpose: first the
version bump through `@tanstack/react-table/legacy` (v8 semantics byte for byte,
six lines), then the native API once that was proven on a box. The legacy
entrypoint is gone.

**What v9 actually needs.** It ships no features by default, so the grid declares
what it uses and everything else tree-shakes:

```
const GRID_FEATURES = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,   // row.getVisibleCells() lives here
  coreRowModel: createCoreRowModel(),
  sortedRowModel: createSortedRowModel(),
});
```

Row models are **slots on that object**, not siblings of it. The registry sits at
module scope deliberately — the table reads it as stable, so rebuilding it per
render hands the table a new registry every pass.

**Two things the types do not infer.** `useTable` needs explicit
`<GridFeatures, Row>` generics or `TData` falls back to `RowData` and every
column def stops matching. And the option is `features`; `_features` is what the
table exposes internally, which is a genuinely confusing pair — TypeScript's
"did you mean" is what caught it.

**`columnVisibilityFeature` is the interesting one.** Nothing in this grid hides
a column, but `row.getVisibleCells()` belongs to that feature, so v9's opt-in
model forces you to name a dependency v8 hid. Expect one or two of those per
table when migrating another.

**How it was verified**, since v9 changes WHEN things re-render and no amount of
typechecking sees that: sorting reorders and the order is internally consistent;
the virtual window moves to 30–77 of 78 rows under a real wheel scroll; a cell
edit re-renders the controlled input and Escape restores it with nothing
committed.

⚠ **The migration shipped a regression in v0.6.87, fixed in v0.6.88 — read this
before migrating another table.** v9 resolves a sortFn **name** only against
functions registered in the features object, and columns use `auto`, which is a
name. Register nothing and every column silently falls back to `basic`: the grid
sorts **case-sensitively**, so `API integration` lands before `Agent edit` where
v8's `alphanumeric` puts Agent first. The fix is one line — `sortFns` in the
features object, the built-in registry of six comparators; registering them
individually means predicting what `auto` resolves to per column type.

**Why everything green missed it.** It warns once per column and then sorts
anyway, so the rows ARE ordered — just by the wrong comparator. Typecheck, 671
tests, a production build, and looking at the grid all passed. What caught it was
a console warning on the DEPLOYED build:

```
sortFn 'alphanumeric' (auto) for column '…' is not registered
```

And it nearly got talked away: an earlier case-insensitive ordering check flagged
the case-sensitive result as "out of order", and that was dismissed as a bad
checker. The checker was crude, but the thing it was pointing at was real.
**`features` is not the only registry v9 makes you fill in** — `sortFns` is
another, and `filterFns` and `aggregationFns` will be too for a table that
filters or aggregates.

⚠ **Three probes lied during this work and each looked like a bug.** A
programmatic `.click()` does not open a Radix menu — it needs real pointer
events, and the menu silently never opens. Setting `scrollTop` on the wrong
ancestor froze the reported virtual window at 0–38, which reads exactly like a
broken virtualiser; so did reading the window before it settled, which needed a
3s wait rather than 2s. And a case-INSENSITIVE ordering check flagged
`API integration` before `Agent edit` as out of order when the sort is
case-sensitive and correct — the checker was wrong, not the grid. Confirm with a
real input event and the right comparator before believing any of them.

**electron 44 · the updater path, tested as far as a local machine allows.** The
stated risk was the updater, and most of it turns out to be checkable without
cutting a release:

1. Packaged for linux on 44 (AppImage + deb). `latest-linux.yml` comes out well
   formed — both artifacts with sha512 and size, and a `blockMapSize` on the
   AppImage, which is what differential updates need.
2. Ran the **packaged** binary, not the dev shell. That is the part that matters:
   `app.isPackaged` is what gates `setupAutoUpdate()`, so only a packaged build
   turns the updater on at all. It reached GitHub, read the release feed, and
   compared versions correctly:

   ```
   Checking for update
   Update for version 0.6.86 is not available
     (latest version: 0.6.84, downgrade is disallowed)
   ```

**The one leg still untested is download-and-install**, which needs a published
release NEWER than an installed build — so the first box to take a release after
this one is the real proof. Watch a linux or windows client; **mac is unsigned
and never self-updates**, fresh installs only, per the note in `desktop.yml`.

Nothing else in the repo names an electron version, and `electron-builder`
26.15.3 / `electron-updater` 6.8.9 were already current, so no toolchain change
rode along.

### Done 2026-09-14 · the cleanup that needed no decision

Seven unused dependencies dropped: `zustand`, `zod`, `sonner` and
`@dnd-kit/modifiers` from `client/web`; `@dicebear/styles`,
`@mantle/content-core` and `katex` from `packages/web-ui`. `katex` and
`content-core` are used heavily — in `client/web`, which declares both itself,
so only the redundant web-ui declaration went. `@dicebear/core` stays; it backs
the backdrops.

`vitest` was declared only at the root while 42 files in `client/web` and 20 in
`packages/web-ui` imported it. Declared in both. Ten web-ui self-imports that
referenced the package by its own alias are now relative.

**Verified with a production build, not just a typecheck** — an unresolved
import from a dropped dependency surfaces at build time and nowhere earlier. The
avatar tests also exercise the style loader `@dicebear/styles` would have backed.

**Still open from this section:** whether `@crossworks/*` moves off 0.232.85 /
0.232.105. Evidence from the v0.6.82 roll says it is not urgent — the pins run
~90 versions behind the server, `contractVersion` is unchanged at 1, and a
signed-in pass across four surfaces found nothing broken.

## 4. Performance · all but one item closed

The audit's §2 scored 8.0 on the strength of the v0.6.48/50 work. Two of its
items are now closed:

- ~~**The three drags set shell state per pointermove**~~ **Done.** The audit's
  only remaining High. `RailHandle` takes a `liveVar` naming the CSS variable
  the rail publishes; with it, a POINTER drag writes that variable straight onto
  the shell root and commits to React once, on release. The keyboard path is
  deliberately unchanged — one event per press, and a render each is right.
  Three details in the commit worth reading before touching it again: why the
  variable is left in place on release, why `aria-valuenow` is written by hand
  during a drag, and why `data-resizing` had to move to the grab edge.
- ~~**The live column polls `/api/activity` every 5 s on every route**~~
  **Done**, but NOT the way the audit suggested. Both cadences are the caller's
  now: collapsed (the default, on every route) the poll drops to a minute and
  the relative-time ticker is switched off entirely; expanded, both are 5 s and
  expanding refetches at once. It is not moved onto `/api/realtime` — that
  stream carries node changes and activity is traces, so wiring it is a server
  change, and the stream's own header calls it best-effort ("a ping to refetch,
  not a data channel"), so a feed on it alone would drop events across a
  reconnect.

Still open, in rough order of value:

- ~~**Task board fetches 500 tasks unvirtualised**~~ **Addressed 2026-09-14, but
  NOT by virtualising** — see §13.
- ~~**The page editor serialises the whole document on every keystroke, twice.**~~ **Measured and closed 2026-09-14 — the serialisation is not the cost. See §14.**
- ~~**The dock context value** changes on almost any dock state and fans out to
  14 consumers, including the shell frame.~~ **Done 2026-09-15 — §17.** It was
  11 consumers, not 14, and the fan-out was measured before it was touched.
- ~~**Memoise the individual assistant turn row.**~~ **Done 2026-09-15 — §17.**
- **Render settled turns as static HTML rather than a live editor each.** STILL
  OPEN, and bigger than the line above it implies — §17 says what blocks it.

⚠ **This session added weight rather than removing it** — roughly 1.2 KB per
route across the seven bug fixes, all of it landing in the app shell. That is
~0.06% of a 2 MB route and every increment was measured and reported, but the
direction is worth knowing before the next person reads the number.

## 5. The five low bugs · all closed

All five fixed in one commit on `fix/audit-remainder`. Recorded here rather than
dropped, because three of them were not quite what the one-liners said:

- **"Random theme" screensaver rewrote the brain-wide theme.** Every tick PUT
  `/api/profile/color-theme`, which every other browser adopts. Shuffles now
  paint locally and keep their pick in localStorage — which is what preserves
  the documented "a reload before the next tick keeps the last theme" without
  the write. Choosing a theme deliberately, or turning the screensaver off,
  drops the override. The decision is pure and tested (`lib/random-theme.ts`).
- **ShareReader folder navigation had no sequence guard.** Generation counter,
  same as `use-file-search`.
- **Concurrent `ensureRendererUrl` could fork two UI servers.** The in-flight
  promise is memoised the way `upgradeOwnerCookie` does it. A FAILED boot is
  deliberately not remembered, so the next window can still try.
- **Connectors leaked a blank tab — and handed it its opener.** Two bugs. The
  tab cannot take `noopener` (that returns `null`, and the popup-blocker-safe
  pattern needs the handle), so it severs `opener` by hand while the tab is
  still `about:blank`. It was also left open and blank whenever the create came
  back with no `authorizeUrl`.
- **The dock's `runTurn` had no auth handling at all.** It now does `apiFetch`'s
  own check, before the ok-check and before the retry loop — re-POSTing a dead
  credential only 401s again until the deadline. `bounceToLogin` is exported
  from `api-fetch` for this; pair it with `isAuthFailure` in any other raw
  `fetch`.

## 6. Two findings that are explicitly half-done

~~**`assetUrl()` is still not reactive.**~~ **Fixed 2026-09-15.** The token is a
store now, not a variable, because the two kinds of caller need different things
from it — and the written diagnosis was right that a hook alone could not cover
both.

- `subscribeAssetToken` + `assetTokenVersion` are the `useSyncExternalStore`
  pair behind `useAssetUrl()`, which the ten components resolving a URL while
  rendering now use. **Anchors gained the most** and were not on the original
  list: a download `href` is resolved at render and used whenever the owner gets
  round to clicking, so it goes stale on rotation, not just on first paint.
- `assetTokenReady()` is a bounded promise for the two imperative fetchers
  (`draw/scene-files.ts`, `draw-embed-theme.ts`), which do not render anything —
  they `fetch()` and need to WAIT, not re-render. It resolves immediately
  same-origin; making it block there would have been a hang on every scene load,
  for a token that is never published.
- `page-editor/image.ts` could not re-render itself: `renderHTML` re-runs only
  when a node's own attributes change, and the token is not one. It parks the
  unsigned path in `data-asset-path` and a plugin re-signs the `<img>` on token
  change — the same DOM-stamping `useDrawEmbedTheme` does, and deliberately not
  a transaction, which would push an undo entry the owner never made.

Two details that cost more than they look: a shell refetch returning the SAME
token must notify nobody, or every asset on the page re-renders for nothing; and
`ProfilePhoto` latches a `failed` flag on error, so it had to clear that latch on
token change or a photo that 401'd on first paint stayed stepped down to the
fallback for the whole session. Pinned in `asset-token-store.test.ts`.

~~**`/tables` restores a collapsed list into a half-state.**~~ **Fixed.** After a
reload with the list collapsed, the collapsed rail rendered but the list panel
stayed at its saved width — both on screen at once, the rail offering to show a
list that was never hidden. `/tables` is the only screen that persists its
collapse (`tables.listCollapsed` via `usePersistedState`); `/notes`, `/pages`,
`/draw` and `/apps` use plain `useState`, so they never reload into a collapsed
state and never showed it.

**The diagnosis recorded here was wrong, which is the useful part.** This file
said the next thing to check was whether `collapse()` fires and is then
OVERWRITTEN by the panel group applying its saved `defaultLayout` — and it had
ruled out the "effect misses the commit where the panels mount" explanation by
reading, on the grounds that `useMediaQuery` and `usePersistedState` adopt in
post-mount effects that flush together, so `isDesktop` and `listCollapsed` flip
in the SAME commit. **They do not.** The persisted value is already `true` on
that path, so there is no flip to ride.

`collapse()` was never called at all. The effect depended on `[collapsible,
listCollapsed]` — the state, but not on whether the panel it drives exists.
Below `isDesktop` there is no panel: the narrow branch is a CSS grid and
`listHandle.current` is null. So the effect ran once against the grid, returned
at the null ref, and nothing re-ran it when the panels mounted a commit later.
Adding `isDesktop` to the dependency list is the whole fix.

**Two probes settled it in minutes, after the reading had settled it wrongly.**
Sampling the list width across the reload (with `setTimeout`, never `rAF` — see
§9) shows it appear at its saved width and **never pass through zero**, which
kills the overwrite hypothesis on its own. Logging inside the effect shows it
running twice, both times with a null ref and `listCollapsed` already `true`.
**A hypothesis ruled out by reading is not ruled out.**

Worth keeping about the shape of the fix: overriding `defaultLayout` to mount
the panel at zero would also collapse it, but the library would then hold no
prior size, and `expand()` would give back the default instead of the width the
user dragged — the round trip this component documents. Mounting at the saved
width and collapsing a beat later keeps it.

It now has the coverage it never had: `e2e/specs/master-detail-collapse-restore.spec.ts`,
which fails on the old code at the saved width and passes on the new. It sets up
both preconditions deliberately — a dragged width for `defaultLayout` to restore,
and a reload rather than a re-render, since the group reads that layout on mount
only.

## 7. Smaller, still carried

- ~~**No React error boundaries**~~ **Done.** `SurfaceErrorBoundary` wraps the
  four surfaces that parse documents written elsewhere — Excalidraw, TipTap, the
  table grid, the app sandbox (five mounts of it). It resets two ways: "Try
  again" remounts the subtree, and `resetKeys` clears the error when the thing
  being viewed changes, without which one drawing that will not open makes the
  NEXT drawing unopenable. `global-error.tsx` and `not-found.tsx` land with it.
  **`loading.tsx` is deliberately not added** — it is not a bug, and adding one
  changes how every navigation in the app feels, which wants someone looking at
  it rather than a sweep.
- **No consistent offline, 5xx or 403 experience.** Only 401 is handled
  centrally.
- **Mobile-broken screens**: inbox three-pane, studio, team-chat access split,
  table grid. `useIsMobile` is used by no app screen.
- ~~**`rel="noopener"` missing at ~22 `target="_blank"` sites**~~ **It was
  two, not twenty-two.** `rel="noreferrer"` IMPLIES `noopener` per the HTML
  spec, and twenty-one of the sites already carried it — sweeping them would
  have changed nothing. The one genuinely open link (the share panel's "Open
  link") is fixed, and `house/require-noopener` now holds the line, straight to
  `error`. The remaining one cannot be fixed here: `<base target="_blank">` in
  the email reading pane takes no `rel`, and the anchors belong to the email,
  whose sanitiser runs on the brain. What it actually costs is written beside
  it in `reading-pane.tsx`, and it is small.
- ~~**`desktop.yml` and `release.yml` pin the deprecated action line**~~
  **Done.** Both are on verify.yml's majors now. `download-artifact` went to
  **v7, not the current v8**, deliberately: v8 turns a hash mismatch into a hard
  failure and stops unzipping by content type, and neither belongs in a workflow
  whose first test run is a release. The docker/* pins in release.yml are
  untouched on purpose — a different vendor, not what was flagged, and bundling
  them would give a broken next release two candidate causes. **Neither file is
  testable from a pull request**; the evidence for the pins is verify.yml
  running them green since v0.6.46.
- **Hover-only affordances with no keyboard reveal**, native controls where kit
  ones exist — the per-screen tail of the accessibility work.
- **`assistant-client` phase 3** (split by what the user is looking at) is not
  started, and the structure plan is explicit that it is optional. The turn
  lifecycle state is the natural next move there, now that the bug which made it
  dangerous to reshape is fixed.

## 8. Habits worth keeping

**Tagging, publishing, and becoming _Latest_ are three separate steps.** The tag
fires the workflows. Publishing the draft is a human act. And `Latest` is a
third thing again — `v0.6.79` published without taking the flag, leaving
`v0.6.67` as what `electron-updater` would still offer. Check all three, and
count how many drafts carry the tag while you are there. See §0.

**Verify from the console, not from a screenshot.** An accessibility tree cannot
tell "not mounted" from `display:none`, and **a blocked iframe still fires its
`load` event** — framing the brain and framing `example.com` both "loaded", and
only the `securitypolicyviolation` record told them apart.

**Prove the instrument before trusting a quiet result.** Two false negatives
this session came from a dead probe rather than working code: the Chrome console
tool does not capture CSP violations at all, and TanStack v5's focus manager
listens on `window`, so a non-bubbling `document.dispatchEvent` never reached it.
Both looked exactly like "the fix works". Fire a deliberate control violation
first.

**Check whether "fix one screen" is really "fix one of three".** It was, three
times out of seven this session: the query cache was three things surviving
sign-out, not one; the session-expiry flush uncovered that the Pages editor had
no hide listener at all, losing typing on a plain reload with no expiry
involved; and the asset-token work needed `apiEventStream` widened before the
dock could even ask to be told. The audit's own recurring finding held to the
end.

**A behaviour-preserving refactor still needs the counterfactual.** Twice a
result looked like a regression and was not — the `/tables` half-collapse and
the dock's "isn't available" — and checking main's version rather than assuming
is what separated them. It takes two commands.

## 9. What the signed-in pass measured

All against the branch running locally (`pnpm dev:fe`) in front of the dev
brain, from the console rather than by eye.

**The three drags — the audit's last High.** The discriminator: delete the
React-controlled `aria-valuenow` after each pointermove and see whether React
puts it back, which it only does on a commit.

|                                           | moves | `aria-valuenow` restored | width tracked the pointer |
| ----------------------------------------- | ----- | ------------------------ | ------------------------- |
| nav (`--nav-w`)                           | 5     | **0 times**              | exact, clamped at 420 max |
| assistant (`--assistant-w`, `boundsRef`)  | 4     | **0 times**              | 379/439/499/559, exact    |
| activity (`--activity-w`, viewport maths) | 3     | **0 times**              | 279/319/359, exact        |

Each committed exactly once, on release. The instrument was proved against the
KEYBOARD path, which is meant to commit per press: same probe, `aria-valuenow`
restored on all five presses, and the arithmetic exact (420 → 412 → 380 → 388,
Home 200, End 420). `data-resizing` flips on grab, and during the drag the
rail's ANIMATED width equals the declared variable — the ease really is
suspended, so the rail is at the pointer rather than 200ms behind it. The
assistant's `mantle_assistant_w` was written once, with the FINAL width, which
is the `onChange`-before-`onDraggingChange` ordering doing its job.

**The live column.** Instrumented `setInterval` rather than waiting out a
minute. Expanded: two intervals at 5000ms (poll + relative-time ticker).
Collapsed: **one** at 60000ms, and the 5000ms ticker is gone entirely.
Expanding fired exactly one `/api/activity` 59ms later.

**The error boundaries.** A real render throw, from a real child, via a
temporary probe added to the dev checkout and removed afterwards. React's own
log confirms it: "handled by the `<SurfaceErrorBoundary>` error boundary". The
editor went from 1 ProseMirror node to 0 while the nav and all six header
controls stayed; `componentDidCatch` logged `[this page]` with the component
stack; "Try again" remounted it (back to 1 node, fallback gone).
**`resetKeys` was NOT exercised** — it needs one boundary outliving a change of
id, and this brain has one page, one app and no tables. Verified by reading
only.

**The theme shuffle.** See §10.

**`/tables` half-collapse: could not reproduce.** This brain has no tables at
all. The hypothesis in §6 is still the thing to test.

### The second pass, at v0.6.81 · the form-control sweep

Same method, different target. The claim being checked is that **nothing
changes** — so the measurement is geometry, not behaviour.

- **The assistant composer**: toolbar controls 32×32 before and after, the 3px
  box and 96px min-height intact, send 48×140 matching the textarea exactly.
- **Files**: row heights stay content-driven (28px for "Recent", 59px and 77px
  for folder rows whose descriptions wrap) and everything stays left-aligned —
  the argument for `RowButton` in one measurement, since `Button` would have
  forced them all to one height with centred content.
- **The file editor**: border 0, padding 16px and JetBrains Mono preserved, and
  `scrollbar-thin` now present where it was not. Three of the most scrollable
  panes in the app were quietly exempt from the house rule because a raw
  `<textarea>` carries nothing.
- **Seven routes, signed in**: `/tasks` (106 RowButtons), `/pages`,
  `/settings/agents`, `/inbox`, `/secrets`, `/apps`, `/files`. **No button
  anywhere collapsed to zero width.** Console clean on a full load.

⚠ **Two dead probes this pass, both of which looked like passes.** A route sweep
driven by `history.pushState` returned identical numbers for all twelve routes —
`pushState` does not drive the App Router, so the page never changed. And the
first error-boundary probe reported nothing because the web-ui module had not
rebuilt; the second because the branch had been inserted into
`componentDidUpdate` instead of `render`. **Prove the instrument.** The console
probe line and the keyboard-path control both exist for this reason.

## 10. The regression the browser caught

Worth reading even if the rest of this file is skimmed, because it is a whole
class of bug.

Removing the shuffle's PUT **broke the shuffle**, and every headless signal said
otherwise: typecheck clean, 668 tests green, production build green, and the
network log confirming the write was gone — which was the thing being fixed.

`app-shell.tsx` adopts the server's colour theme once `/api/shell` lands, a
moment after the provider's first shuffle tick. That was harmless only because
the shuffle wrote its pick to the server first, so the value coming back WAS the
shuffled one. Take the write away and the value coming back is the brain's own
theme, which painted over every tick. The pick was chosen, stored, and invisible.

**The generalisation:** removing a write can break a reader that was quietly
depending on it. Nothing in the type system, the tests or the diff connects
`color-theme-provider.tsx` to `app-shell.tsx:283` — the coupling is a round trip
through the server. When a change removes a write, ask what reads that value
back, and look for the answer in a browser rather than in the file you are
editing.

Fixed by having `adoptServerTheme` decline while the screensaver holds a pick;
`serverThemeWins` carries the rule as a pure function with tests.

---

## 11. Picking up cold

**Newest first: `docs/handover-session-2026-09-15.md`** is the map of the
2026-09-15 session (form controls, the v0.6.100 release, the CI gate, the
assistant's re-renders) and says what is not landed. Then read this section,
then §1 and §9. In rough order of what unblocks most:

**Done IN GIT:** the release pipeline (six cuts, §0/§8), the `table-grid` twelve
(§12), the last raw form controls (§15), the radio-group a11y fix (§16), a green
e2e suite (§2), every dependency major that is not blocked upstream (§3), the
task board (§13) and the page editor (§14).

⚠ **"Done in git" is NOT "on the box", and the gap is now six versions wide.**
As of 2026-09-15, main is **v0.6.99** and pushed; the newest TAG is **v0.6.93**;
the dev box serves **v0.6.90** against mantle `v0.232.183`. So v0.6.94–v0.6.99
— every raw form control, both size scales, the radio fix — exist only in git.
There are no stale drafts this time (the §0 failure mode), because **no tag was
ever cut**: `scripts/tag-release.sh` is the missing step, and then the release
must still be PUBLISHED and set Latest by hand. Check `/settings/updates` on the
box for what it actually serves; a green pipeline and a stale box are not a
contradiction.

⚠ **Nobody has USED the box yet.** This round changed visible UI on nearly every
screen and four screens is not coverage. Two things specifically want a human:
**dragging a task card between columns** (§13 — the board change was verified
structurally, not by a live drag) and **a page outline following a heading edit**
(§14 — the deployed check was blocked by the automated tab). Both are seconds of
clicking and neither can be automated from here.

**1 · ~~The last 15 e2e failures~~ · DONE, and the gate is ARMED** (§2, §18). **163 passed / 1 skipped** at v0.6.99. The CI job no longer waits on an `E2E_SERVER_URL` variable — it **builds its own brain per run** from the published server image, so it cannot be left un-armed and cannot wipe anything real. §18 is what that took.

**2 · ~~The last 13 raw controls~~ · DONE 2026-09-15** (§15). 188 → 0, the cap is 0 and the rule is `error`. `Input` gained a size scale on the way, which is what unblocked them, and the browser pass caught a 4px height regression the conversion introduced. The two follow-ups it raised are **also done**: `SelectTrigger` got the same rungs in v0.6.98, and the radio groups that moved focus but not the selection are fixed kit-wide in §16.

**3 · Dependency decisions** (§3). **Nothing is open.** `@tanstack/react-table` 9 (native API) and `electron` 44 are done; `vite` 8, `typescript` 7 and `vitest` 5 are all blocked upstream, so there is no decision to take. The one thing worth knowing: TypeScript's available step is **6**, not 7 — the eslint parser caps at `<6.1.0`, and the old table hid this by listing only 7.x as "latest".

**4 · ~~Performance's remainder~~ · all but one item DONE** (§4, §17). The dock context split and the turn-row memo both landed, each measured before and after. The ONE thing left is **rendering settled turns as static HTML** — and §17 explains why it is not the small tweak the original line implies: the callout/aside/embed chrome lives entirely in React NodeViews with no CSS fallback, so it wants the server-side renderer `page-view.tsx` already calls "Phase 5's".

**5 · `assetUrl` reactivity** (§6). The `/tables` half-collapse that used to sit beside it is **fixed**. `assetUrl` is the one left, and it is the most interesting thing still open: a hook cannot be the answer, because three of the call sites are plain modules feeding TipTap and Excalidraw from outside React. It needs a subscribable store, or the shell withholding asset-bearing children until the token lands — and only in split deployments.

### What this repo expects of you

- **Worktrees are the default**: `scripts/new-worktree.sh <name>`. The original clone stays on main and is only used for merges and releases. Land with `scripts/merge-branch.sh <branch>`, which bumps the version on main as part of the merge.
- **`pnpm verify` before handing anything over**, and the lint cap only ever falls.
- **Browser-check UI changes against a deployed brain** — and read `docs/handover-verification.md` §2 first, because getting a signed-in session needs a person and is worth batching.
- Both repos are public: no client names, hostnames or IPs in commits, code or docs.

## 12. The table-grid twelve · done 2026-09-14

**What unblocked it:** the dev brain has tables now — 7 workbooks — where §1's
table said it had none. That was the only thing holding this group.

**Eight buttons.** The delete-row icon, three cell popover triggers and three
popover menu items took `RowButton`; the expand-cell icon took
`Button size="icon-2xs"`, its improvised `p-1` being exactly the 22px the 24px
rung was added for. The expanded-cell editor took `Textarea` — it carries a real
box, so it has a twin.

**The inset ring.** `RowButton` ships the kit's OFFSET ring, which is the thing
an offset ring inside a table cell overflows. The three triggers pass
`focus-visible:ring-inset focus-visible:ring-offset-0`. Verified through
`tailwind-merge` that the caller wins: `ring-offset-2` is dropped, `ring-inset`
and `ring-2` survive, and so does the caller's box.

**Three fields keep a raw element** behind the rule's sanctioned disable, each
with its reason in place: the column name and the cell editor are chrome-less by
design (a border, a height or a ring would draw a box around a heading, or turn
a grid into a page of boxes), and the popover search is a ~30px field where
`Input` is a fixed `h-10` with no smaller rung. **Give `Input` a size scale and
that third one becomes a twin** — it is the only one of the three that wants the
kit and cannot have it.

**Measured in a signed-in browser, not looked at.** 467 buttons on a real grid,
**zero of zero width** — that is the failure mode this pass watches for. The
expand icon is 24×24 (was an improvised 22), delete-row is 14×14 (the icon's own
size; `RowButton` adds no box), triggers hold 192–198 × 32–34 and do not overflow
their cell. The focus ring was confirmed by pressing a real Tab first: a
programmatic `.focus()` does NOT set `:focus-visible` in Chrome, so the first
probe read `box-shadow: none` and proved nothing. With a real keypress it renders
`0 0 0 2px inset` in the ring token.

⚠ **Three of the twelve are converted but NOT browser-exercised**: the
`ReferenceCell` menu items (Clear / value / free-text). They need a column of
type `reference` with a `ref` target, and no table on the dev brain has one.
They are the same `RowButton` pattern as the verified six and they keep their
full className box, so the risk is low — but it is not zero and it is not
measured. Exercising them needs a scratch table with a reference column.

## 13. The task board · why it is not virtualised

**Measured first, on a real board of 217 tasks** (103 / 16 / 98 across To do,
In progress, Done — the fetch caps at 500):

- 2,754 DOM elements, against 1,395 for the same screen in list view.
- The two big columns are **~12x taller than their viewport** (10,396px and
  11,002px of content in a 901px scrollport), so roughly 92% of their cards are
  off-screen at any moment.
- **No long tasks. None.** Not on mount, not on selecting a card. On a fast
  workstation at this size there is no jank to feel. The case here is structural
  and about headroom, not a stopwatch — say so rather than claiming a fix for
  something nobody reported.

**Virtualising was the wrong tool, and the reason is dnd-kit.** It measures real
nodes to decide where a drop lands. Unmount the off-screen ones and drops near
the edges go to the wrong index — a failure that is silent, corrupts ordering,
and would not show up in any check this repo runs. `@tanstack/react-virtual`
being already in the tree is not a reason to reach for it on a drag surface.

**What was done instead**, both keeping every node mounted:

1. **The card is memoised**, taking `onSelect(id)` instead of a pre-bound thunk,
   with the parent's callback stabilised by `useCallback`. Selecting a card used
   to re-render all 103 cards in a column, because each one was handed a fresh
   `() => onSelect(t.id)` on every render. Now only the two cards whose
   `selected` actually flipped re-render. `useSortable` keeps its own
   subscription, so drag still re-renders what it needs to.
2. **`content-visibility: auto` with `contain-intrinsic-size`**, the same pattern
   as the font dialog's preview list. The browser skips layout and paint for
   off-screen cards while the node stays in the DOM for dnd-kit to measure.

**Result, forced layout across the three columns:** 12.9ms → 5.5ms, and
14.5ms → 2.0ms when the measurement order was reversed to rule out ordering bias.

⚠ **A live drag was NOT exercised** — a real drop reorders real tasks. What was
checked instead: all 217 nodes stay mounted and dnd-wired, none zero-sized, and
an off-screen card keeps a real 96px box from `contain-intrinsic-size` while an
on-screen one reports its true 116px. That box is the thing dnd-kit measures, so
the risk is low — but it is unexercised, and dragging between columns is the
first thing to try on the box.

**Two dead probes here, both of which would have sent you the wrong way.**
`checkVisibility({ contentVisibilityAuto: true })` reported **zero** cards
skipped — and reported zero on a purpose-built control too, so the instrument is
simply not answering in this browser; it says nothing about whether
content-visibility works. And calling `getBoundingClientRect()` on all 103 cards
in one synchronous loop makes every one report the 96px intrinsic size, which
reads exactly like "the placeholder is stuck and tall cards will overlap".
Measured one card at a time, a frame apart, on-screen cards report their true
height. Measure the EFFECT (layout time with the class on versus off), not the
browser's opinion of its own state.

## 14. The page editor · the serialisation was not the problem

**Measured first, on the largest page in the system** — 123 KB of ProseMirror
JSON, ~33k nodes:

|                                 |                                          |
| ------------------------------- | ---------------------------------------- |
| `editor.getJSON()`              | **0.1 ms** (median of 12)                |
| `JSON.stringify` of that result | **0.5 ms**                               |
| total per keystroke             | **~0.7 ms**, about 4% of a 16.7 ms frame |

So the audit's "serialises the whole document on every keystroke, twice" is
literally true and costs almost nothing. Engineering it away would have been
effort spent on 4% of a frame, in the most delicate file in the app — autosave,
optimistic concurrency, 409 handling, an unmount flush.

**What did cost, sitting right beside it.** `buildPageToc` returns a FRESH array
every call, and the outline is rebuilt on an animation frame for as long as
someone types. So `setToc` handed React a new reference ~60 times a second and
re-rendered the whole ~1,100-line page client each time — while the outline only
changes when a heading or a sub-page card does, which is almost never
mid-sentence.

**The fix keeps the rebuild and drops the state update.** `setToc` now takes a
functional updater that returns the PREVIOUS array when the outline is
unchanged, which bails React out of the render entirely. Comparing the built
result, rather than guarding earlier on a heading walk, is deliberate: the build
is not what costs, and the comparison is a pure function over `TocEntry[]` that
unit-tests without standing up an editor. Seven tests cover it — including a
sub-page that keeps its id while its indentation moves under a new heading,
which an id-only comparison would miss.

⚠ **Two probes lied here and the second one nearly got written up as a
regression.** Benchmarking `doc.toJSON()` while discarding the result lets V8
eliminate the call — it read 0.1 ms because nothing ran; the number above is from
a version that consumes the output. Worse: **the outline never rebuilt at all in
the first browser run**, because the automated tab runs HIDDEN and
`requestAnimationFrame` does not fire in a hidden tab. That made "typing a
paragraph leaves the outline alone" look like a pass and "editing a heading
updates the outline" look like a failure — the optimisation appearing to work and
the feature appearing broken, from the same dead probe. Route the app's rAF
through `setTimeout` before trusting anything on an rAF path here; it is the same
trap §9 already records for probes, and it applies to APPLICATION code just as
much.

## 15. The last 13 raw form controls · done 2026-09-15

`docs/handover-form-controls.md` enumerated them; this is what each took, and
what the browser said afterwards. **188 → 0, cap 0, rule `error`.** Fourteen raw
controls went, not thirteen: the table-grid popover search (§12) was waiting on
the same change.

### What unblocked it: `Input` got a size scale

`Button`'s rungs, at the same heights — `xs` 32 / `sm` 36 / `default` 40 / `lg`
44 — so a field and a button in one row line up without either being hand-sized.
Two deliberate departures from `Button`, both in the style guide (§6d):

- **No `2xs`.** Every rung keeps `text-base` below `md` (iOS Safari zooms in on
  a focused field under 16px and does not zoom back out), and 24px cannot hold
  16px text. A smaller rung buys its height from padding, never from the text.
- **`size` is `Omit`ted from the native props.** The HTML attribute of that name
  is a character count; keeping both would make `size="xs"` a type error at all
  274 call sites. Nothing used the native one.

### The six selects

Two debug pickers, three on `/settings/embedding`, and the sort control inside
the model picker. **Radix forbids `''` as an item value** — it reserves it for
"nothing selected" — so every `<option value="">` became a sentinel mapped back
at the boundary. That trap is the whole story of the embedding pair:

⚠ **§1 said Radix "does not forward" `name`, then corrected itself to say it
does. Both are true and neither is the point.** Radix 2.3.7 does render a hidden
native `<select name>` whenever the trigger is inside a form
(`SelectBubbleInput`, gated on `isFormControl`). But the API-key select's
keyless choice travels as `__none__`, and **that is the string the bubble would
have POSTed.** Measured on the page: the bubble for that field holds `__none__`
while the form's own hidden input holds `""`. Passing `name` to `<Select>` — the
fix §1 pointed at — would have silently saved a nonexistent key id.

So both submit through a colocated hidden input, which is also what the `Switch`
directly above them already does. Colocation is the reason, not habit: the
backup route only renders when failover is on, so its keys appear exactly when
it is on screen, with no condition in `handleSave` to drift out of step.

### The four radio / checkbox

The folder checkbox took `Checkbox`; its `name="folders"`/`value` were **dead** —
the form submits `save.mutate()`, which reads the `checked` Set, and nothing ever
read a FormData. It gained an `aria-label`: the folder name beside it was never
tied to the control, so it announced itself unnamed.

The three heartbeats radios became one `RadioGroup` each. They **carried no
`name`**, so the browser never grouped them: three tab stops, arrow keys dead.

### The three inline fields

The tab rename took `Input size="xs"`. The other two keep a raw element behind
the rule's sanctioned disable, with the reason beside each — the same call the
`table-grid` pass made for its column name and cell editor, and for the same
reason: **the box belongs to the wrapper.** A tag entry inside a bordered chip
row and a path-parameter inside a chip whose border turns red to mark it
unfilled. A second box inside either draws a box inside a box, and a smaller
rung does not help — the problem is the box, not the height.

### Measured in a signed-in browser, not looked at

Against a throwaway brain (`e2e/README.md` recipe; the harness's own bearer puts
a signed-in page up with no sign-in). **Zero of zero width** across every
converted control.

| Claim                                         | Evidence                                                                                                                                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The embedding POST carries both fields        | a real submit: body `primary_provider=openrouter`, `primary_api_key_id=""`; DB row `openrouter` / **NULL**, not `'__none__'`                                                                                                        |
| …and round-trips                              | fresh load shows `openrouter` in the trigger and NULL rendering as "None (keyless / local)"                                                                                                                                         |
| The sort menu does not fight the model picker | opened inside the popover: **both listboxes open at once**, popover survives; ArrowDown moved the sort highlight `newest`→`name` while the cmdk list held its selection AND its `scrollTop`; Enter committed and the list re-sorted |
| The grid's popover search fits                | `h-8`, 32px unscaled, does not overflow its `w-56` popover                                                                                                                                                                          |
| …and its ring stays inside                    | a **real Tab**: `:focus-visible` true, `0 0 0 2px inset` in the ring token — a programmatic focus proves nothing here (§12)                                                                                                         |
| The radio groups are groups                   | one tab stop; ArrowRight moves focus and the roving tabindex follows (`once` → `tab0`, siblings `-1`)                                                                                                                               |

**A geometry regression the measuring caught.** The three embedding triggers came
out at **36px against the 40px of every `Input` beside them** — `SelectTrigger`
defaults to `h-9` and the raw `<select>` they replaced was `h-10`. Exactly the
"one screen rendered buttons at four different heights" failure the twins rule
exists to stop, and invisible in a screenshot. All three now pass `h-10`; all ten
controls on that form measure 40.

`pnpm verify` green at `--max-warnings 0`; `pnpm e2e` **161 passed, 1 skipped**,
the six heartbeats specs among them.

### Two things left open — BOTH NOW CLOSED

Recorded here as open on 2026-09-15; both were taken the same day. Kept because
what each turned out to be is worth more than the fact that it is fixed.

1. ⚠ **Arrow keys moved focus in a `RadioGroup` but not the selection.** → **§16.**
   Confirmed **kit-wide** (reproduced on `/settings/appearance`, never touched by
   this pass) and it hit `ToggleGroup type="single"` too. **The diagnosis written
   here was wrong**, and usefully so: it blamed listener ORDER — React's
   delegated keydown running before Radix's document listener, leaving the
   arrow-key flag false. The flag is in fact set correctly during the keydown. It
   is the `keyup` that clears it, before a focus that `react-roving-focus` defers
   through a `setTimeout` has even landed. A capture-phase listener — the fix
   this note pointed at — would have changed nothing.
2. **`SelectTrigger` had no size scale, and its `h-9` default did not match
   `Input`'s `h-10`.** → **fixed in v0.6.98.** It got the same rungs, and its
   default moved to `h-10`; the three `h-10` hand-pins on `/settings/embedding`
   above are plain `<SelectTrigger>` again. The count was worse than the ~20
   estimated here: **28 of 76 call sites** set their own height, 15 of them
   spelling out the `h-9` default they already had. `/settings/profile` was
   rendering four selects at 36px against four `Input`s at 40 in one stack.

## 16. The radio groups that moved focus but not the selection · fixed

_Both primitives that wear `role="radio"` — `RadioGroup` and `ToggleGroup
type="single"`. Same symptom, two different upstream causes, one shared fix._

`ArrowRight` on a `RadioGroup` moved focus to the next radio and moved the
roving `tabindex` with it — and left `aria-checked` where it was. Native radios
and the WAI-ARIA radio pattern both select on arrow, so this was a real a11y
bug, and it was **kit-wide**, not anything about the heartbeats screens where it
was first seen. Measured on `/settings/appearance`, whose Mode and avatar-style
pickers had never been touched: same failure, same build, every time.

**It is a race between two upstream Radix packages.** `react-roving-focus` does
not move focus in the keydown handler — it queues `setTimeout(() =>
focusFirst(…))` and returns. `react-radio-group` selects the newly focused item
from `onFocus`, but only while an "arrow key is down" flag is set, and it
clears that flag from a **document-level `keyup`**. So the selection follows
focus only if the key is still held when the deferred focus lands. On
`/settings/appearance` that deferral measured **50–60 ms** after keydown, with
the focus landing as late as 150 ms when the previous click was still
re-rendering. A quick tap loses. Every automated press loses: Playwright and CDP
send `keyup` 0 ms after `keydown`, so `keyup` always wins — which is exactly why
162 green e2e tests never caught it.

**The proof, before any of it was believed.** A `keyup` listener registered at
document CAPTURE that calls `stopImmediatePropagation` — so Radix's own
document-level `keyup` never runs, and its flag is never cleared — makes
`ArrowRight` select correctly on the unmodified app. Nothing else changed. The
mirror image also holds: holding the real `keyup` back by 100 ms and replaying
it makes the unmodified app behave. Both were run signed-in against a real
brain, with REAL key presses; a programmatic `.focus()` or a synthetic
`KeyboardEvent` does not exercise Radix's roving focus at all.

⚠ **The original hypothesis — listener ORDER — was wrong, and it is worth saying
why.** The guess was that React's delegated `keydown` runs before Radix's
document listener, so the flag is still `false` when `onFocus` fires. The first
half is true (a document listener registered after hydration sees the event with
`defaultPrevented` already set), but it does not matter: the flag IS set during
the keydown. It is the `keyup` that undoes it, before the focus it was meant to
gate ever happens. A capture-phase listener in the kit wrapper would have fixed
nothing. The upstream code is unchanged in `@radix-ui/react-radio-group` 1.4.7 —
the latest — and in the 1.4.8 release candidates, so there is no version to
upgrade to.

**The fix re-asserts the selection; it does not re-implement the navigation.**
`packages/web-ui/src/ui/radio-group.tsx` puts an `onKeyDown` on the ROOT, which
therefore runs after the item's own handler in the same synthetic dispatch — so
the timer it queues is queued after the one Radix queued, and runs after it. By
then focus has landed, and clicking whatever it landed on is the whole fix.
Gating on `event.defaultPrevented` means roving focus has already ruled on
orientation, direction, `loop` and disabled items, and none of that is
duplicated. An `onClickCapture` records what Radix (or a real mouse) already
clicked during the press, so a consumer whose `onValueChange` settles
asynchronously never takes a second one for the same choice — capture, because
`RadioTrigger`'s own `onClick` stops propagation to keep the hidden form input
from double-firing.

Verified signed-in with real key presses, A/B on the same build: with the
handler disabled, `ArrowRight` leaves `light:true` while focus sits on `dark`;
with it restored, `dark:true` with exactly one synthetic click. Horizontal and
vertical groups, both directions, wrapping at both ends, `Tab` in and out
selecting nothing. The Mode picker really flips the app to light — the whole UI
follows, so this drives the form and not just the ARIA.

**`ToggleGroup type="single"` had the same gap, from a different cause, and is
fixed the same way.** Radix gives a single-select toggle group `role=
"radiogroup"` and `role="radio"` items carrying `aria-checked` — `aria-pressed`
is explicitly removed — so assistive technology judges it by the radio pattern.
But `react-toggle-group` has no select-on-focus at all: not a race, simply
absent. Arrow keys moved focus and never touched the selection, on every
`ToggleGroup` in the app (the sidebar's Work/Settings/Admin, the backdrop tint,
the editor and file view switchers — all thirteen are `type="single"`; there is
no `type="multiple"` anywhere yet).

Because the remedy is identical, it lives in one place:
`packages/web-ui/src/ui/selection-follows-focus.ts`, consumed by both wrappers.
It takes an `enabled` flag so a future `type="multiple"` group — `role=
"toolbar"`, independent toggles, `aria-pressed` — is left alone; arrowing onto a
toolbar button must never press it.

⚠ **One guard matters more here than it does for radios.** A single-select
toggle group treats a press on its OWN checked item as a DESELECT
(`onItemDeactivate` sets the value to `''`). Re-asserting a selection onto an
already-checked item would therefore EMPTY the group rather than no-op. The
`aria-checked === 'true'` early return is what stops that, and the loop test
below is what proves it stays a no-op.

Verified signed-in with real key presses on the sidebar's Work/Settings/Admin
toggle: `ArrowRight` moves Work → Settings → Admin, wraps to Work, `ArrowLeft`
wraps back — exactly one item checked at every step, one synthetic click per
press, and the sidebar menu really switches section. The deferred focus measured
58 ms after keydown with `keyup` at 4 ms, the same shape as the radio case.

**One thing this did NOT establish.**

- **"Space did not select either" is a harness artifact.** This browser tool
  sends Space as an event with `key: ""`, `code: ""` and `keyCode: 0` — a
  malformed key the page can do nothing with — and its `type` action uses
  `insertText`, which fires no key events at all. Space is native button
  activation, which Radix only intercepts for `Enter`; there is no reason to
  think it is broken, and no way to test it from here.

**The e2e spec is written: `e2e/specs/radio-arrow-selection.spec.ts`.** Two
tests, one per primitive. Each clicks an item, arrows through the group, and
asserts the focus moved AND `aria-checked` followed, wrapping at both ends, with
exactly one item checked at every step; each also asserts the change reached the
APP and not just the ARIA (the Mode picker's theme, the spend chart's caption).

It is a reliable ratchet rather than a flaky one for the same reason the bug was
invisible for so long: `keyboard.press()` sends `keyup` 0 ms after `keydown`, so
it loses the race EVERY time. ⚠ Do not "stabilise" it into a
`keyboard.down` / `waitForTimeout` / `keyboard.up` sequence — that would hide
precisely what it guards. Confirmed both ways: with the kit hook disabled both
tests fail, and they fail on the `aria-checked` line with the `toBeFocused` line
above them passing, which is the bug's exact signature.

⚠ **The obvious ToggleGroup target is the wrong one.** `/tasks`'s view toggle
REMOUNTS itself when the view changes, so focus is gone before the second arrow
key and the spec fails for a reason unrelated to what it tests. The spec uses
the dashboard spend chart's range picker instead: single-select, three items,
pure component state, no remount, nothing persisted.

Suite after: **163 passed, 1 skipped, 0 failed** (161 before, plus these two).

⚠ **`team.spec.ts` will fail with `ERR_CONNECTION_REFUSED` if the brain's
`MANTLE_CLIENT_ORIGIN` names a client that is not the one you are testing.** It
is the only spec that navigates a BROWSER to the server origin, and the server's
`/team` stub 307s to whatever that variable says — so a client moved to another
port (because a second worktree held `:3901`) fails this one spec and nothing
else. The error names the server URL, not the redirect target, which is what
makes it read as a dead brain. `curl -i $BRAIN/team | grep -i location` settles
it in one command.

## 17. The assistant's two re-render items · done 2026-09-15

Both were **measured before being touched**, because §14 is this document's own
worked example of a stated performance problem that was not one. These were.

### The dock context fanned out to everyone

`AssistantDockProvider` handed out ONE value of 45 fields, memoised on all 45,
to 11 consumers (§4 said 14). `messages` is one of those fields, so the fan-out
fired on every streamed token — and the 630-line app shell was downstream of it.

Measured on `/tasks` with render counters, toggling `picking`, which
`<PickMode/>` reads and nothing else does:

|                   | before | after | reads `picking`?                 |
| ----------------- | ------ | ----- | -------------------------------- |
| `PickMode`        | 4      | 4     | yes                              |
| `AppShell`        | 4      | **0** | no — it reads four LAYOUT fields |
| `QuestionWatcher` | 4      | **0** | no — one callback, no state      |

Split by WHAT CHANGES, which turned out to match what consumers ask for:
**actions** (every callback; stable for the life of the provider — four of the
eleven need nothing else), **layout** (panel geometry; what the shell reads),
**session** (the conversation — the hot one). The three are `Pick`ed from
`AssistantDockApi`, and `_DockSplitIsExhaustive` stops compiling if a field is
added without being placed.

⚠ **Counter-check anything like this**, because a split that simply disconnects
a consumer shows the same zero. `AppShell` still re-renders on a `dockWidth`
change — verified. And `PickMode`/`QuestionWatcher` still re-render on layout
changes, because they are rendered INSIDE `AppShell` (`app-shell.tsx:613` and
`:617`): ordinary parent-child re-rendering, not the context, and one per
interaction rather than one per token.

### The transcript rebuilt every row on every frame

Memoised as a whole since v0.6.50 — which is why a composer keystroke does not
walk it — but its dependency list carried `streamReply`, `streamTrail`,
`streamTokens` and the rest, and **those change once per frame**. A 25-turn
thread rebuilt 25 rows to show one of them growing, each carrying a TipTap
editor.

The fix works because every streaming value is read in the `showTyping` branch
and nowhere else, and that branch requires `!turn.response` — a settled turn
reads none of them. They travel as one `live` object, `null` for every row but
the one in flight; `turns` is memoised on `messages`, so settled turn objects
keep their identity across frames and `memo` bails out.

    row renders caused by 5 `live` changes:   125  ->  0

`TurnRow` went to `turn-row.tsx` rather than staying inline: at 1,821 lines
`assistant-client.tsx` had gone through the max-lines ceiling (1,583 now), and
the live-buffer markdown components went to `stream-markdown.tsx` because the
row needs them and importing the screen from the row would be a cycle.

### ~~⚠ Static HTML for settled turns is NOT the small follow-on it sounds like~~ · done 2026-09-15

**Both halves of the paragraph this section used to carry were wrong, and that
is the third confident written diagnosis in this document to be disproved by
measurement.** It is recorded in full below, because the way it was wrong is
more useful than the fix.

It said the blocker was that the chrome is not in the HTML — `Callout.renderHTML`
emits `<div data-callout data-variant=…>` and nothing else, with **no CSS
fallback** — and it recommended writing the server-side JSON→sanitised-HTML pass
that `page-view.tsx` names as "Phase 5's public renderer".

1. **The CSS fallback already ships.** `globals.css` imports
   `@mantle/share-ui/styles/app.css`, which styles `[data-callout]`,
   `[data-aside]`, `.file-embed`, `[data-child-page]` and `.column-list` —
   written for the public share surface, which renders the identical shapes.
   The rules are scoped under `.ProseMirror`, which is why the static container
   keeps that class; it is load-bearing, not decoration.
2. **The server renderer would not have helped**, because `render-page-doc.ts`
   emits the same bare `<div data-callout>`. Route 2 was never going to produce
   different chrome from route 1 — it would have bought a second renderer to
   keep in step, which was the stated objection to route 1.

So `StaticDoc` calls the schema's own `renderHTML` via `generateHTML`. Measured
side by side on one reply carrying every block type: **87 elements and 5
contenteditable nodes before, 65 and 0 after**, callouts / asides / columns /
task list / table / blockquote / code block present in both. `RichText` and
`PageView` both use it, so the "one job serving two surfaces" claim survived
even though the route did not.

**What reading would never have caught:** code blocks came out unhighlighted.
`CodeBlockLowlight` highlights through a ProseMirror DECORATION, not through
`renderHTML` — four `hljs` spans in the editor render, zero in the static one,
and nothing in the markup to hint at it. The static pass now highlights with the
editor's own `lowlight` instance (exported for the purpose) so there is one
language registry, not two. The general rule: anything a NodeView or a plugin
DRAWS is absent from `renderHTML`, and the absence is silent.

A static container also has no plugins, so it does two things for itself — re-sign
its images when the asset token rotates (§6), and stamp drawing embeds for dark
mode via `stampDrawEmbeds`, split out of `useDrawEmbedTheme`.

**One deliberate difference, left open on purpose:** a callout renders as the
share surface's tinted left-bar panel, not the in-app NodeView's bordered box
with a lucide icon. Closing it means defining callout appearance in two places.
Route 2 would have shipped exactly the same difference without naming it.

**Not covered by e2e:** there is no assistant spec at all. `PageView` is covered
(`pages-reading-width.spec.ts` locates `.ProseMirror`), the assistant transcript
is not.

## 18. Arming the CI e2e gate · the job builds its own brain

`verify.yml` had an `e2e` job gated `if: vars.E2E_SERVER_URL != ''`. That
variable was never set, so **the job had never once run** — a suite that is
green only because someone remembers to run it by hand.

**It could not safely be set, either.** The suite creates and deletes content,
and there is no throwaway brain: every box in the fleet is real, and the one
called `mantle-test` has served Astron since 2026-07-29. jackdaw is the client —
no server workspace, no database — so it cannot boot one from its own source.

So the job **boots the published server image**, the same one the fleet runs:
pgvector + the image's own `migrate && pgboss:init && provision`, then the
server on `:3900`. Fresh per run, dies with the runner, costs nothing, cannot
wipe anything that matters. `E2E_SERVER_URL` still wins when set, so aiming a
run at a real brain stays one variable away — but nothing has to be set.

### The five things it took, and what each would look like to the next person

Every one was a real environment truth, and the first three were invisible to a
local rehearsal because this workstation already had what a runner does not.

1. **`docker pull minio/minio` is DENIED on a runner** ("repository does not
   exist or may require 'docker login'"). The rehearsal missed it because the
   image had sat in the local cache for twelve months, so `docker run` never
   touched a registry — **a probe that lied by succeeding.** quay.io is MinIO's
   own registry and pulls anonymously.
2. **A `services:` entry cannot carry a command**, and the MinIO image needs
   `server /data`. Without it the container prints its own usage text and exits,
   and the runner reports only "Failed to initialize container" — the usage text
   is the sole clue, and it reads like a broken image.
3. **`MANTLE_MASTER_KEY` must decode to EXACTLY 32 bytes.** An arbitrary string
   boots fine and fails the first WRITE, surfacing as a 500 from
   `/api/onboarding` during bootstrap — which looks like a broken application.
4. **An unset GitHub secret renders as the EMPTY STRING**, and `e2e/lib/env.ts`
   used `??`, which only falls back on null/undefined. So it posted an empty
   email and got the signup route's own message back: "Enter a valid email and a
   password of at least 8 characters" — which reads as "the default account is
   wrong" rather than "there is no value here". Every `E2E_*` variable now takes
   `||`. Reproduced against a real brain: empty creds 400, real creds 200.
5. **Service containers are a BRIDGE network; the brain runs on HOST.** Anything
   that must reach BACK to the brain has to be on host too. The browser sidecar
   was a service, so `MANTLE_PRINT_ORIGIN=http://localhost:3900` — correct from
   the brain's side — was its own container from the sidecar's, and the PDF and
   draw-snapshot specs died with ERR_CONNECTION_REFUSED naming a URL that looks
   right. **Treat that as one rule, not two incidents** (it is also why MinIO's
   bucket step addresses localhost rather than a container name).

The init SQL is **not copied into the workflow** — the job cats it out of the
image it is about to test, so it matches that server and cannot drift. A
hand-copied version was wrong in three ways on the first attempt: invented an
extension, missed `ltree`, and renamed `password_hash`.

`MANTLE_MASTER_KEY` and `SESSION_SECRET` are generated per run and **masked**
before export: anything written to `$GITHUB_ENV` is an ordinary variable and is
echoed in every later step's env group, so without `::add-mask::` the brain's
keys sit in the log in plain text.
