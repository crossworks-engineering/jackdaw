# Handover: what is left of the frontend audit

Rewritten 2026-09-10 at **v0.6.78**, and updated the same day after the
`fix/audit-remainder` branch. Everything below is open unless it says
otherwise, and what is closed lives in the audit rather than here.

- **The audit** is the authority and is current:
  <https://claude.ai/code/artifact/216dc6be-2285-424f-bc90-72ed7410942e>
- Companions: `docs/handover-frontend-audit.md` (the rollout and its landmines),
  `docs/handover-structure.md` (the structure pass), `docs/handover-verification.md`
  (the signed-in rig).

**Where it stands.** Every medium and med-low bug in the audit's §1 is closed,
each with tests; the CSP is fully emitted; `assistant-client` phase 2 is done.
The release pipeline defect is fixed and shipped. The five low bugs are closed,
so are both remaining High items — the three per-pointermove drags and the
missing error boundaries — and the live column no longer polls on every route.
536 → 668 unit tests.

**What is left needs either a person or a browser.** Three items want a running
app (the lint backlog, one green e2e, and the `/tables` half-collapse); one
wants judgement (the dependency majors); the rest of §4 and §7 is ordinary work
nobody has started.

**`fix/audit-remainder` is browser-verified**, signed in against the dev brain.
§9 records what was measured. It caught one regression the branch had
introduced — see §10, which is the more useful reading.

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

**Still open on the same file:** `desktop.yml` and `release.yml` pin the
deprecated action line (§7). Deliberately NOT bundled with the race fix —
neither is testable without cutting a tag, and landing both together would give
a broken next release two candidate causes.

**A check worth adding to the release habit:** after publishing, confirm the
release actually became _Latest_. `PATCH draft=false` with `make_latest` in the
same call did not take on `v0.6.79`, and `v0.6.67` kept the flag — which is what
`electron-updater` reads. It needed a second explicit PATCH. See §8.

## 1. The 188 raw form controls · the last lint backlog

`no-raw-form-control` is the one of the three house rules still at `warn`,
capped at 188 so nothing new joins it. The other two reached zero and are
`error`.

It was not swept with them for a reason: it **rewrites rendered markup** rather
than swapping a class. A raw `<button>` becoming `<Button>` changes layout,
sizing and focus behaviour, so it wants eyes on a running app, screen by screen,
not a scripted pass.

Hotspots: `assistant-client`, `files-client`, `table-grid`, `studio-view`.

**Done when** the count reaches zero and the rule is promoted to `error`. Lower
the cap in `package.json` as it falls; never raise it.

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

## 3. Dependency decisions · the untouched worklist item

Five majors deliberately undecided, plus eleven declared-but-unused
dependencies. Take the majors one at a time:

| Package                 | At    | Latest | Note                                                                                                  |
| ----------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------- |
| `@tanstack/react-table` | 8.21  | 9.x    | Column defs and row models changed; touches only `table-grid`                                         |
| `vitest`                | 4.1   | 5.x    | Wait a point release                                                                                  |
| `vite` (desktop)        | 7.x   | 8.x    | Follows electron-vite, which still pins 7                                                             |
| `electron`              | 43.2  | 44.x   | Routine, but test the updater path                                                                    |
| `typescript`            | 5.9.3 | 7.x    | The native-compiler rewrite. Check the eslint parser and the Next TS plugin first — not a casual bump |

Also: decide whether the `@crossworks/*` contract packages move from 0.232.85 to
current; drop `zustand`, `zod`, `sonner` and `@dnd-kit/modifiers` from
`client/web` and three unused from `packages/web-ui`; declare `vitest` where it
is imported; make the six web-ui self-imports relative.

**When you touch pins, edit `pnpm-workspace.yaml`, not `package.json`** — pnpm
11 silently ignores the `pnpm` field in package.json here, and every override in
this repo was inert until that was found.

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

- **Task board fetches 500 tasks unvirtualised**, each a dnd-kit sortable.
  `@tanstack/react-virtual` is already a dependency, used in exactly one place.
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
