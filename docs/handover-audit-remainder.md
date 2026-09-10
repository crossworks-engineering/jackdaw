# Handover: what is left of the frontend audit

Rewritten 2026-09-10 at **v0.6.78**, tagged and green. This replaces the
patchwork the previous version had become — everything below is open unless it
says otherwise, and what is closed lives in the audit rather than here.

- **The audit** is the authority and is current:
  <https://claude.ai/code/artifact/216dc6be-2285-424f-bc90-72ed7410942e>
- Companions: `docs/handover-frontend-audit.md` (the rollout and its landmines),
  `docs/handover-structure.md` (the structure pass), `docs/handover-verification.md`
  (the signed-in rig).

**Where it stands.** Every medium and med-low bug in the audit's §1 is closed,
each with tests; the CSP is fully emitted; `assistant-client` phase 2 is done.
536 → 659 unit tests. What is left is one blocking pipeline defect, three items
that need a person, five low bugs nobody has touched, and a performance
dimension that has not moved since the audit.

---

## 0. BLOCKING · v0.6.78 must not be published as it stands

`gh release list` shows **two drafts for the same tag**, with the desktop
artifacts split across them:

| draft `386214935`                             | draft `386214937`                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| linux `.deb`, `.AppImage`, `latest-linux.yml` | mac `.zip`/`.dmg`, Windows `Setup.exe`, `latest-mac.yml`, `latest.yml` |

`Jackdaw-0.6.78-arm64-mac.zip.blockmap` is in the first release and its own
`.zip` is in the second. Publishing either one ships half the platforms and an
updater manifest pointing at assets that are not there.

**Cause.** `desktop.yml` runs
`strategy.matrix.os: [ubuntu-24.04, macos-latest, windows-latest]` and each job
lets electron-builder create the draft. Creating a draft release is not
idempotent by tag, so the jobs raced.

**This is probably what actually built the pile of 21.** The audit read that gap
as "publishing is a separate manual step nobody performed" — true, and still the
standing habit — but a matrix that mints a fresh draft per run turns one
forgotten publish into a growing heap, and makes "is it published?" the wrong
first question. Ask _how many drafts carry the tag_ too.

**Do this before the next tag:** one job creates the release (or a step creates
it up front) and the other two upload to it. Then consolidate v0.6.78's assets
into a single draft, publish that, and delete the empty one. The same file still
pins the deprecated action line (§7), so both changes belong together.

---

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

## 4. Performance · untouched since the audit, and now the weakest dimension

Nothing in the audit's §2 has been done. It scores 8.0 on the strength of the
v0.6.48/50 work and has not moved since. In rough order of value:

- **The three drags set shell state per pointermove** (the audit's only
  remaining High): rail, activity and dock-width. Each move re-renders
  `ShellFrame` and reflows main, aside and the live column. **The popout drag
  already does it right** — CSS vars via ref during the drag, one commit on
  release — so this is a pattern to copy, not to invent.
  `packages/web-ui/src/ui/rail-handle.tsx:104`, `app-shell.tsx`, and
  `assistant-dock.tsx:441-470` (the good one).
- **The live column polls `/api/activity` every 5 s on every route**, even
  collapsed, which is the default. A multiplexed realtime SSE already exists.
  Confirmed still live in a browser this session.
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

## 5. The five low bugs nobody has touched

All confirmed still open by reading the tree on 2026-09-10.

- **"Random theme" screensaver rewrites the brain-wide theme.** Every shuffle
  tick PUTs `/api/profile/color-theme`, which every other browser adopts. The
  comment says visitor-local. `color-theme-provider.tsx:111`.
- **ShareReader folder navigation has no sequence guard** — a slow response for
  one folder can land after a fast one for another. Same shape as the
  `use-file-search` race fixed in phase 2; a generation counter is the fix.
  `share-reader.tsx:82-116`.
- **Concurrent `ensureRendererUrl` can fork two UI servers** in the desktop
  shell. `uiServer` is a plain module `let` with no in-flight promise memo —
  `upgradeOwnerCookie` in `api-fetch.ts` is the shape to copy.
  `client/desktop/src/main/index.ts:195`.
- **Connectors leak a blank tab**: `window.open('', '_blank')` with no
  `noopener` at `connectors-client.tsx:137`. The two `authorizeUrl` opens beside
  it already pass it, so this one is the odd one out.
- **The dock's `runTurn` uses raw `fetch`** and has **no auth-failure handling
  at all** — so a 401 there never bounces to login, and therefore never reaches
  the v0.6.78 session flush either. `assistant-dock.tsx:798`.

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
restore-on-load is wrong. `MasterDetail` appears to latch its panel-group size
at mount and ignore a `listCollapsed` arriving after it, which is every restore.
Likely affects any MasterDetail screen that persists a collapse. **The fix
belongs in `MasterDetail`, not in `use-persisted-state`** — that hook's
render-fallback-then-adopt behaviour is deliberate and fixes a hydration
mismatch documented in its own header.

## 7. Smaller, still carried

- **No React error boundaries** around Excalidraw, TipTap, the table grid or the
  app sandbox, and no `global-error.tsx` / `not-found.tsx` / `loading.tsx`. A
  throw in any editor unmounts the whole route. (The audit calls this High.)
- **No consistent offline, 5xx or 403 experience.** Only 401 is handled
  centrally.
- **Mobile-broken screens**: inbox three-pane, studio, team-chat access split,
  table grid. `useIsMobile` is used by no app screen.
- **`rel="noopener"`** missing at ~22 `target="_blank"` sites.
- **`desktop.yml` and `release.yml` pin the deprecated action line**
  (`checkout@v4`, `pnpm/action-setup@v4`, `setup-node@v4`) while `verify.yml` is
  current. They ran green cutting v0.6.78 — but see §0; that file needs opening
  anyway, so do both at once.
- **Hover-only affordances with no keyboard reveal**, native controls where kit
  ones exist — the per-screen tail of the accessibility work.
- **`assistant-client` phase 3** (split by what the user is looking at) is not
  started, and the structure plan is explicit that it is optional. The turn
  lifecycle state is the natural next move there, now that the bug which made it
  dangerous to reshape is fixed.

## 8. Habits worth keeping

**Publishing is a separate step from tagging — and now, so is counting the
drafts.** See §0.

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
