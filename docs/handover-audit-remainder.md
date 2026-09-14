# Handover: what is left of the frontend audit

Current at **v0.6.82**, on main, pushed, green and released. Everything below
is open unless it says otherwise, and what is closed lives in the audit
rather than here.

> **Start here in a fresh session.** Read §11 first — it is the shortest path
> back in, and it says what each remaining item needs before it can move.

- **The audit** is the authority and is current:
  <https://claude.ai/code/artifact/216dc6be-2285-424f-bc90-72ed7410942e>
- Companions: `docs/handover-frontend-audit.md` (the rollout and its landmines),
  `docs/handover-structure.md` (the structure pass), `docs/handover-verification.md`
  (the signed-in rig).

**Where it stands.** The audit scores **9.2**, re-scored at v0.6.81. Every bug
in its §1 is closed down to two half-findings. Both remaining High items are
done — the three per-pointermove drags and the missing error boundaries — the
live column no longer polls on every route, and raw form controls went 188 → 25.
536 → 671 unit tests. Everything landed in this round was verified in a
signed-in browser; §9 records what was measured and how.

**Released.** `v0.6.82` was cut on 2026-09-14 and carries v0.6.80 + v0.6.81 —
the first release of this round. All three steps done and checked from the box,
not from `gh`: tagged, draft published, `Latest` set, after which
`/settings/updates` read *"v0.6.82 installed · latest v0.6.82 · Up to date"*.
The dev box now runs client **v0.6.82** against server **v0.232.183**.

**What is left needs something a session cannot bring**: a throwaway brain, a
brain with tables on it, or a decision. §11 is the map.

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

## 1. Raw form controls · 188 → 13 · the last 13 are three problems

**Every raw `<button>` is gone**, `table-grid` included — 171 across 66 files.
The cap is at **13** and the rule is still `warn`; promoting it to `error` is
the last step. What is left is thirteen FIELD elements: selects, radios,
checkboxes and inline inputs. No buttons remain anywhere.

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

|                   | n   | needs                                                                                                                                                                                                                                   |
| ----------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`table-grid`~~  | ~~12~~ | **Done 2026-09-14** — the dev brain has tables now (7 workbooks), which is what unblocked it. Eight buttons took `RowButton`/`Button`, the expanded-cell editor took `Textarea`, and three chrome-less fields kept a raw element behind a sanctioned disable. See below. |
| native `<select>` | 6   | A decision per form. The kit's `Select` is a Radix listbox: different keyboard model, no native picker on mobile, and **three of the six carry `name=` for a native form POST** that Radix does not forward.                            |
| radio / checkbox  | 4   | `RadioGroup` needs the group restructured around the inputs. The checkbox carries `name`/`value` for a form post, same problem as the selects.                                                                                          |
| inline fields     | 3   | A tab rename and a tag entry that must be invisible inside their containers. `Input` brings a border and a height; these can take neither. The rule's sanctioned `eslint-disable`.                                                      |

**Done when** the count reaches zero and the rule is promoted to `error`. Lower
the cap in `package.json` as it falls; never raise it.

**Habit from this pass:** convert screen by screen and measure the geometry, not
the diff. Conversions are supposed to change nothing visible — the assistant's
toolbar was 32×32 before and after — so what to watch for is a control that
**collapses** when a primitive stops supplying its box. A DOM query, not a look.

## 2. One green `pnpm e2e` · against a throwaway brain

The runner works. `E2E_SERVER_URL=<brain> pnpm e2e` puts this checkout's owner
UI on `:3901` in front of that brain and runs the `split` project. Everything
was verified except the part needing a real brain: both refusal paths fail fast,
and against a stub answering `/api/version` the UI boots, `/env.js` names the
stub, and Playwright reaches global-setup and fails exactly where it should.

⚠ **The suite creates and deletes content.** A throwaway brain, never one
anybody relies on.

Once green, CI picks it up on its own: the Playwright job in `verify.yml` runs
whenever the repository variable `E2E_SERVER_URL` is set, and is skipped rather
than failing until then.

## 3. Dependency decisions · three of the five are not decisions

**Checked 2026-09-14.** Three of the five majors are blocked upstream, so there
is nothing to decide on them yet. The other two are genuinely available.

| Package | At | Note |
| --- | --- | --- |
| `vite` (desktop) | 7.x | ⛔ **Blocked.** `electron-vite` 5.0.0, the latest, peers `vite ^5 \|\| ^6 \|\| ^7`. Vite 8 is not adoptable until electron-vite widens that. Nothing to decide. |
| `typescript` | 5.9.3 | ⛔ **7 is blocked, but 6 is not.** `typescript-eslint` 8.70.0 peers `typescript >=4.8.4 <6.1.0`, so TS 7 would take the parser out. **TypeScript 6.0.3 exists and is inside that range** — the real next step is 6, not 7, and the old table listing only 7.x as "latest" hid that. TS 7 (one release) can wait for the parser. |
| `vitest` | 4.1.11 | ⏸ **Wait, unchanged.** 5.0.0 is still the ONLY stable 5.x. The original advice to wait a point release has not been overtaken. |
| `electron` | **44.3.0** | ✅ **Done 2026-09-14.** Chromium 150 → 152, V8 15.0 → 15.2, Node stays on 24. Updater exercised locally as far as it goes — see below. |
| `@tanstack/react-table` | **9.2.4** | ✅ **Done 2026-09-14**, via the legacy entrypoint — see below. |

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

## 4. Performance · the two biggest are done, the rest is untouched

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
- **The page editor serialises the whole document on every keystroke, twice.**
- **The dock context value** changes on almost any dock state and fans out to 14
  consumers, including the shell frame.
- From the structure work: memoise the individual assistant turn row, and render
  settled turns as static HTML rather than a live editor each.

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

**`assetUrl()` is still not reactive.** The refresh half shipped in v0.6.77, but
anything rendered before the shell lands still emits a URL with no `at=` and
never re-renders when the token arrives. **A hook cannot be the answer** — three
call sites (`page-editor/image.ts`, `draw/scene-files.ts`,
`draw-embed-theme.ts`) are plain modules feeding TipTap node views and
Excalidraw, outside React entirely. It needs a subscribable store those modules
can read, or the shell withholding asset-bearing children until the token
resolves — and only in split deployments, since same-origin never needs a token.

**`/tables` restores a collapsed list into a half-state.** After a reload with
the list collapsed, the collapsed rail renders but the list panel stays at its
full ~296px, so both are on screen at once. Pre-existing, not from the phase 2
work — verified by measuring main's own `tables-shell.tsx` and getting the
identical result. The live collapse/expand round trip is fine; only
restore-on-load is wrong. Likely affects any MasterDetail screen that persists
a collapse. **The fix belongs in `MasterDetail`, not in `use-persisted-state`**
— that hook's render-fallback-then-adopt behaviour is deliberate and fixes a
hydration mismatch documented in its own header.

**One hypothesis was ruled out by reading, and one is left to test.** The
obvious explanation is that the collapse effect
(`master-detail.tsx`, `[collapsible, listCollapsed]`) misses the commit where
the panels mount: on the first render `isDesktop` is null, so the CSS-grid
branch renders and `listHandle.current` is null, and the effect returns having
done nothing. But both `useMediaQuery` and `usePersistedState` adopt in
post-mount effects that flush together, so `isDesktop` and `listCollapsed` flip
in the SAME commit — the effect re-runs with the ref populated, and
`panel.collapse()` is called. So that is probably not it.

What is left, and what to check first in a browser: whether `collapse()` is
called and then OVERWRITTEN by the panel group applying its saved
`defaultLayout`, which holds the width the user last dragged
(`master-detail:tables` in localStorage, and `onlySaveAfterUserInteractions`
keeps a 0 out of it). Put a breakpoint or a log in that effect; if it fires and
the panel is still 296px a frame later, the restore is the thing to fix, not the
effect. Reproduce with the list collapsed and a width previously dragged.

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

Read this section, then §1 and §9. In rough order of what unblocks most:

**Done · cut a release.** `v0.6.82` is cut, published and _Latest_, and the dev box runs it against mantle `v0.232.183` (that release recorded the pair in mantle's `client-pair.tag`, which had been stale at v0.6.42). Dashboard, `/tables`, `/tasks` and the assistant panel were checked signed-in on that pair; all render with real data and a clean console. This round changes visible UI on nearly every screen, so it is still worth using the box in anger rather than treating those four screens as coverage.

**1 · One green `pnpm e2e`** (§2). Needs a throwaway brain; the suite creates and deletes content. CI picks it up on its own once the repository variable is set.

**2 · The last 13 raw controls** (§1). All thirteen are per-form behavioural decisions, not a sweep — selects carrying `name=` for a native POST, radios needing the group restructured, inline fields that must stay invisible. Do them when the form in question is being touched anyway. The `table-grid` twelve are done.

**3 · Dependency decisions** (§3). Three of the five are blocked upstream and are not decisions — checked 2026-09-14. `@tanstack/react-table` 9 is **done**, on the native API — the legacy entrypoint is gone. `electron` 44 is **done** too, so **no dependency major is open**. The three that remain (`vite` 8, `typescript` 7, `vitest` 5) are all blocked upstream; TypeScript **6** is the available step when someone wants it. TypeScript's real next step is **6**, not 7 — the eslint parser caps at <6.1.0.

**4 · Performance's remainder** (§4). The unvirtualised task board is the largest and `@tanstack/react-virtual` is already a dependency. The page editor serialising twice per keystroke is the next.

**5 · `assetUrl` reactivity and the `/tables` half-collapse** (§6). Both have a written diagnosis and neither has a fix. The `/tables` one has a ruled-out hypothesis and a specific next test, which is worth more than the original note was.

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
