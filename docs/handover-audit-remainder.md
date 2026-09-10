# Handover: what is left of the frontend audit

Written 2026-09-09, at v0.6.67 — **released and published**, so the box can
reach it for the first time since August. Updated 2026-09-10: item 1 is done.

Of the audit's nine worklist items, eight are done (the CSP closed at v0.6.69)
and dependency decisions are untouched. The structure work, which was never a
worklist item, is three quarters done. This file is what remains, in the order
worth doing it, with what is already known about each so nobody re-derives it.

The companions, all current:

- `docs/handover-frontend-audit.md` — the rollout and its eight landmines.
- `docs/handover-structure.md` — the structure pass, phases 0-2 done.
- `docs/handover-verification.md` — the test rig for signed-in work, and the
  deployment gap (closed, but the shape recurs).
- The audit itself: <https://claude.ai/code/artifact/216dc6be-2285-424f-bc90-72ed7410942e>

---

## 1. ~~Finish the CSP~~ · done, at v0.6.69

`buildRuntimeCsp()` is emitted as a `<meta http-equiv>` from the root layout,
which reads `MANTLE_SERVER_ORIGIN` per request. Verified signed in against the
dev brain: `connect-src` names the brain, so the claim in `token-store.ts` is
now true.

**Running it found two directives wrong**, neither of which throws — which is
the whole reason this one waited for a session:

- **`frame-src 'self' blob:` blocked three surfaces.** All three resolve to the
  brain, and all three are cross-origin _only in a split deployment_, so they
  are invisible on the monolith: the mini-app sandbox, which navigates its
  opaque-origin iframe to `${apiBase}/frame`; the Files PDF preview; and the
  share preview panel. The brain was already trusted by every other directive.
- **`img-src` without `https:` blocked every remote image in an email body**,
  because the reading pane is a `srcdoc` iframe and `srcdoc` inherits the page
  policy. Blocking them buys no security — `img-src` carries no response back —
  while breaking every newsletter with no "show images" control to opt in. The
  end state is the brain's sanitizer proxying those images; then it drops back
  to the tight list. That is a mantle-repo item, not this one.

**What was actually exercised**, signed in, with a `securitypolicyviolation`
listener held across client-side navigation (a full page load resets it):

- twelve routes clicked through in-app — zero violations;
- the Files cross-origin image preview, loading from the brain via the `?at=`
  asset token — no violation;
- the mini-app sandbox's exact shape, `${apiBase}/frame` framed with
  `sandbox="allow-scripts"` — permitted;
- the email body's exact shape, a `srcdoc` iframe with a remote image — loads,
  where it measured zero before the fix.

**Three things could not be exercised on the dev brain** and are still worth a
look wherever they exist: a real mini-app (the only app there has no published
build), a real email (no account connected), and a PDF preview (no PDF in
files). The first two had their mechanism tested directly, as above; the PDF is
the same `frame-src` + `assetUrl` shape as the sandbox probe.

**Two traps for whoever verifies a CSP next.** A blocked iframe still fires its
`load` event, so rendering proves nothing — the violation record is the only
honest signal. And the Chrome console tool does not capture CSP violations at
all: a deliberate control violation produced no console output, so a "clean
console" sweep through it is worthless. Use the `securitypolicyviolation`
listener, and prove it is alive with a control before trusting a quiet result.

## 2. ~~`assistant-client` phase 2~~ · done

1,866 → 1,799 lines, 18 `useState` → 16, 57 new tests, `max-lines` ratcheted to 1799. `docs/handover-structure.md` §3 has the full account; the short version:

- **The prize is taken.** `groupTurns`, `buildContextPreamble` and
  `splitSentContext` now have 27 tests. The marker contract between the last
  two is asserted from both ends — one writes the prefix the other cuts on, and
  editing either alone starts showing readers the machine-written tail.
- **`assistant-thread-state.ts`**, 23 tests, for the scroll and paging
  arithmetic that was inline in effects. Two of those had a silent wrong
  version: the prepend restore (transposed, it teleports the reader to the top)
  and the "is there more history" decision (read off the deduped rows instead of
  the page length, it strands the reader with older turns unreachable).
- **`use-voice-input.ts`**, 7 tests, the one cluster with a clean seam.

**The double-reconciliation bug is fixed** (`createTurnSettleGuard`, 7 tests) —
see §6 below. The turn-lifecycle state around it is still untouched and is now
the natural next move, since the reason for leaving it alone was that the bug
sat inside it.

Phase 3 (split what remains by what the user is looking at) has not been
started, and the plan is explicit that it is optional: stop when each file is
one screen region a reviewer can hold in their head, not at a number.

## 3. The 188 raw form controls · the last lint backlog

`no-raw-form-control` is the one of the three house rules still at `warn`,
capped at 188 so nothing new joins it. The other two reached zero and are
`error` now.

It was not swept with them for a reason: it **rewrites rendered markup** rather
than swapping a class. A raw `<button>` becoming `<Button>` changes layout,
sizing and focus behaviour, so it wants eyes on a running app, screen by
screen, not a scripted pass.

Hotspots: `assistant-client`, `files-client`, `table-grid`, `studio-view`.

**Done when** the count reaches zero and the rule is promoted to `error`.
Lower the cap in `package.json` as it falls; never raise it.

## 4. One green `pnpm e2e` · against a throwaway brain

The runner works. `E2E_SERVER_URL=<brain> pnpm e2e` puts this checkout's owner
UI on `:3901` in front of that brain and runs the `split` project. Every part
of it was verified except the part that needs a real brain: both refusal paths
fail fast, and against a stub answering `/api/version` the UI boots, `/env.js`
names the stub, and Playwright reaches global-setup and fails exactly where it
should.

⚠ **The suite creates and deletes content.** A throwaway brain, never one
anybody relies on.

Once it is green, CI picks it up on its own: the Playwright job in `verify.yml`
is already wired and runs whenever a repository variable `E2E_SERVER_URL` is
set. It is skipped, not failing, until then.

## 5. Dependency decisions · the untouched worklist item

Five majors were deliberately left undecided, plus eleven declared-but-unused
dependencies. Take the majors one at a time:

| Package                 | At    | Latest | Note                                                                                                  |
| ----------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------- |
| `@tanstack/react-table` | 8.21  | 9.x    | Column defs and row models changed; touches only `table-grid`                                         |
| `vitest`                | 4.1   | 5.x    | Wait a point release                                                                                  |
| `vite` (desktop)        | 7.x   | 8.x    | Follows electron-vite, which still pins 7                                                             |
| `electron`              | 43.2  | 44.x   | Routine, but test the updater path                                                                    |
| `typescript`            | 5.9.3 | 7.x    | The native-compiler rewrite. Check the eslint parser and the Next TS plugin first — not a casual bump |

Also: decide whether the `@crossworks/*` contract packages move from 0.232.85
to current; drop `zustand`, `zod`, `sonner` and `@dnd-kit/modifiers` from
`client/web` and three unused from `packages/web-ui`; declare `vitest` where it
is imported; make the six web-ui self-imports relative.

**When you touch pins, edit `pnpm-workspace.yaml`, not `package.json`** — pnpm
11 silently ignores the `pnpm` field in package.json here, and every override in
this repo was inert until that was found.

## 6. The bugs still open

**Lazy `localStorage` initialisers — FIXED.** Both remaining sites use
`lib/use-persisted-state` now. Worth separating what each actually had:
`team-workspace-shell` had both halves — lazy initialisers (the hydration
mismatch) AND an unguarded read during render (the throw that takes the member
surface to the error page). Its `typeof window === 'undefined'` guard made that
look safe and answers the wrong question: `window` exists in a browser blocking
site data, where touching `window.localStorage` throws. `tables-shell` already
restored in an effect, so it never had the mismatch — only four unguarded
accesses. The `'1'`/`'0'` codec is `parseFlag`/`serialiseFlag` on the hook now
rather than a fourth hand-rolled copy.

⚠ **Found while measuring, NOT fixed and NOT caused by this change:** on
`/tables`, restoring a collapsed list on load leaves a half-state — the
collapsed rail renders but the list panel stays at its full ~296px, so both are
on screen. Reproduces identically on main (checked by measuring main's own
`tables-shell.tsx`). The live collapse/expand round trip is fine; only
restore-on-load is wrong. `MasterDetail` appears to latch its panel-group size
at mount and ignore a `listCollapsed` that arrives after it — which is every
restore, since the hook deliberately adopts stored values in an effect. Likely
affects any MasterDetail screen that persists a collapse. The fix belongs in
`MasterDetail`, not in the hook.

**Login submit has no catch — FIXED.** The handler was try/finally with no
catch, so a rejected fetch escaped as an unhandled rejection while `finally`
re-enabled the form and showed nothing. Reproduced in a browser (stub fetch to
reject) and confirmed fixed the same way. `client/web/lib/sign-in-error.ts`, 15
tests. Two notes worth keeping: `fetch` rejects with one opaque TypeError for
offline, DNS, refused connections and CORS alike, so the message must not guess
which — a missing origin in the brain's `MANTLE_API_CORS_ORIGINS` is
indistinguishable from being offline; and the token branch's
`as { token: string }` was a lie that put `undefined` in the token store on a
200 with no token, landing the user in a shell where everything 401s.

**Fixed since this list was written:** the assistant's double reconciliation of
a finished turn. A turn has two independent announcers — the stream's terminal
phase and the 3s safety poll that exists because that phase can be missed — and
on a healthy turn both arrive. That was safe while the guard was
`pendingTurnRef`, and stopped being safe when settling became async:
`reconcileDone` awaits a `/messages` round-trip before that ref is cleared, so
both announcers see a live pending turn inside the window and both reconcile.
The cost was a duplicate round-trip and a duplicate `fetchSuggestion` per turn
(the second bumps the epoch, killing the first retry ladder). `reconcileDone`'s
`setMessages` happens to be idempotent, which is why this stayed a curiosity
rather than a visible break — it was one non-idempotent line from not being.
`createTurnSettleGuard` claims the turn synchronously, before the first await.

⚠ **The race window is a few hundred milliseconds wide and cannot be
reproduced on demand in a browser** — the poll has to tick inside one await.
The argument for it is the code and the guard's tests, the same standard the
audit used ("confirmed by reading the source"). A signed-in turn was run on the
fixed build and settled exactly once, which is a no-regression check, not a
reproduction.

From the audit's §1, none of them fixed:

- **Asset token never refreshes.** The `['shell']` query runs once per mount; a
  tab open past the token TTL 401s on every image, iframe and download until
  reload.
- **Dock turn subscription can never be torn down.** No disposer is stored, so a
  silent 404 exit leaves the bubble pending and `busy` true app-wide until
  reload. Same family as the team-stream 404 fixed in v0.6.53, but a different
  site.
- **Query cache survives sign-out.** A second user signing in on the same tab
  first paints the previous user's profile and messages from cache.
- **Session expiry mid-edit** loses up to 8 s of typing: `bounceToLogin` is a
  full navigation, so React unmount flushes never run. Only Draw has a
  `pagehide` flush.

## 7. Smaller, still carried

- **No React error boundaries** around Excalidraw, TipTap, the table grid or the
  app sandbox, and no `global-error.tsx` / `not-found.tsx` / `loading.tsx`. A
  throw in any editor unmounts the whole route.
- **No consistent offline, 5xx or 403 experience.** Only 401 is handled
  centrally.
- **Mobile-broken screens**: inbox three-pane, studio, team-chat access split,
  table grid. `useIsMobile` is used by no app screen.
- **`rel="noopener"`** missing at ~22 `target="_blank"` sites.
- **`desktop.yml` and `release.yml` pin the deprecated action line**
  (`checkout@v4`, `pnpm/action-setup@v4`, `setup-node@v4`) while `verify.yml` is
  on the current one. They ran green cutting v0.6.67, so it is not urgent — but
  it is the last open piece of the audit's CI item, and it is the release
  pipeline.
- **Hover-only affordances with no keyboard reveal**, native controls where kit
  ones exist — the per-screen tail of the accessibility work.
- **Perf leftovers**: memoise the individual assistant turn row; render settled
  turns as static HTML; the three rail drags that set shell state per
  pointermove; the live column's 5 s poll on every route.

## 8. Two habits worth keeping

**Publishing is a separate step from tagging.** The release workflow opens a
draft; someone has to publish it. That gap swallowed 21 releases. After cutting
a tag, check `gh release list` and publish deliberately.

**Verify from the console, not from a screenshot.** Everything the click-through
proved was measured against the live DOM — the DOM before first open,
`selectionStart` through a stream, the live region's text while the reply grew.
A screenshot would have shown all of it "working" and proved none of it. An
accessibility tree, in particular, cannot tell "not mounted" from
`display:none`.
