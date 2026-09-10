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

## 2. `assistant-client` phase 2 · unblocked now

The last of the four oversized screens, and the one the structure plan says to
do last. It was gated on the signed-in click-through, which is now done — so it
is unblocked.

1,866 lines, 18 `useState`. Phase 1 already lifted its pure layer into
`assistant-turns.ts` (the message and turn shapes, `groupTurns`,
`buildContextPreamble`, `splitSentContext`) and its small parts into
`assistant-turn-parts.tsx`. `groupTurns` and `buildContextPreamble` decide what
the model actually receives and still have no tests; that is the prize.

**Why it is last, and still the riskiest:** it carries the live turn stream, the
reconciliation of a streamed reply against the durable row, and an open
double-reconciliation bug (audit §1, `assistant-client.tsx:786-838`).

`docs/handover-structure.md` has the phase order, the shapes to copy
(`tasks/task-meta.ts` and `use-turn-stream.ts`), and three traps that cost a
redo each when scripting code motion.

**One judgement to carry over:** do not group state for the sake of the count.
`worker-form`'s two route objects were deliberately left as eleven `useState`
because they encode no illegal state and grouping them would touch forty render
sites to move a number. `files-client`'s six dialog booleans _were_ worth
collapsing, because they could spell thirty-one states that must never happen.
The difference is whether the type is lying.

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

From the audit's §1, none of them fixed:

- **Login submit has no catch.** A rejected fetch is an unhandled rejection; the
  form re-enables with no error, and `res.json()` runs on a 200 that may be HTML.
  `login-form.tsx:50-108`.
- **Lazy `localStorage` initialisers**, in `team-workspace-shell` and
  `tables-shell`. `files-client` was fixed in v0.6.64 —
  `client/web/lib/use-persisted-state.ts` is the hook to reuse, and the fix is
  two lines per site. The team shell reads storage unguarded _during render_,
  which throws outright in a browser blocking site data and takes the whole
  member surface to the error page.
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
