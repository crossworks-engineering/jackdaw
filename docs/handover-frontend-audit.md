# Handover: the frontend audit rollout (2026-09-07)

A full frontend audit of `client/web`, `packages/web-ui` and `client/desktop`
was run at v0.6.42 and rated the tree **6.5/10**. It is **8.1** now: of its nine
worklist items, **seven are done, the CSP is half done, and dependency
decisions are untouched**. This file is the state of the world around that
work: what changed, what is left, and the handful of things that will burn you
if nobody tells you.

The audit itself is the authority on the findings and carries the live
worklist; this file does not repeat it.

**Two numbering schemes, so say which you mean.** The audit's worklist has nine
items and is the one the numbers above count. §3 below is this file's own
shorter ordering of what to do next, and its numbers are unrelated — saying
"item 6" without naming the list is how the count in this paragraph came to be
wrong three times.

- **Report** (interactive, kept current): <https://claude.ai/code/artifact/216dc6be-2285-424f-bc90-72ed7410942e>
- **The structure pass**: `docs/handover-structure.md` — phases 0-2 done; the
  last screen and the remaining phases are written up there.
- **Verifying, and the deployment gap**: `docs/handover-verification.md` — how
  to put current code in front of a real signed-in session, what has been
  verified that way, and the fact that **none of this rollout is deployed**.
- **Dev brain page**: `Jackdaw frontend audit 2026-09-07`, tags `audit` / `jackdaw`
- **Roadmap task**: "Act on the jackdaw frontend audit (2026-09-07)", tag `mantle-roadmap`

---

## 1. Where things stand

| Repo        | Branch | State                                                              |
| ----------- | ------ | ------------------------------------------------------------------ |
| **jackdaw** | `main` | Pushed, CI green, no release tag cut. Version: see `package.json`. |

(The version is deliberately not written into that cell. It moves with every
landing, and the release commit lands AFTER the doc commit that would record
it, so a number here is stale the moment it is correct — it was wrong three
times before this note replaced it.)

`pnpm verify` on main: typecheck clean across all four workspaces, 484 tests,
prettier clean, **188 lint warnings against a cap of 188** (see §5). Production
build green. `pnpm audit`: no known vulnerabilities.

Eleven commits landed, in this order:

| Version | What                                                                                  |
| ------- | ------------------------------------------------------------------------------------- |
| v0.6.43 | Dependency refresh; pnpm settings moved so they actually apply; audit 22 findings → 0 |
| v0.6.44 | The three release-blocking bugs                                                       |
| v0.6.45 | Mermaid support dropped entirely                                                      |
| v0.6.46 | The CI gate                                                                           |
| v0.6.47 | CI actions moved to current majors                                                    |
| v0.6.48 | Assistant panel mounts on first open, not every page load                             |
| v0.6.49 | Half the CSP enforced                                                                 |
| v0.6.50 | Streaming and typing jank                                                             |
| v0.6.51 | The three decayed prose rules become lint rules                                       |
| v0.6.53 | `?next=` hardened; the auth/transport core gets tests; a 404 ends the stream          |
| v0.6.55 | Palette literals and scrollbars cleared; both rules promoted to `error`               |
| v0.6.56 | The accessibility pass: live region, reduced motion, focus rings, dialog popout       |
| v0.6.58 | The e2e runner points at a brain; Playwright gated into CI                            |

(`91ee13b`, the settings-hub e2e rewrite, landed alongside from a separate
session.)

---

## 2. What landed, and what it bought

**The three bugs (v0.6.44).** A `mantle:///host` deep link resolved to an
external origin and was loaded into the desktop window whose preload exposes
the token vault; `will-navigate` does not fire for programmatic loads. The
table editor dropped the last edit if you navigated within its 1.2 s debounce,
because the effect cleanup only cancelled the timer. Login's `?next=` went
straight to `router.push`, and the app router hard-navigates external URLs, so
it was an open redirect fired the moment a password was accepted.

**Mermaid (v0.6.45).** Our own engine was retired in 2026-08; this removed the
feature Excalidraw bundles. Built client JS fell 3.8 MB and 81 chunks, and
three CVE overrides retired with it.

**The CI gate (v0.6.46/47).** `pnpm verify` on every push to main and every
PR, green in 88 s. Before this, the two workflows were tag-triggered and
nothing checked ordinary work.

**The assistant panel (v0.6.48).** It was mounted from page load and hidden
with `display:none`, which put the whole editor stack (TipTap, ProseMirror,
KaTeX, lowlight's ~37 grammars, react-markdown, marked) on every signed-in
route, and did live work behind the hidden panel. Mean per-route client JS fell
from 1,736 KB to 782 KB across all 106 routes, a 55% cut.

**Streaming and typing (v0.6.50).** Stream deltas now commit once per animation
frame instead of once per token; the transcript element is memoised so a
keystroke no longer re-renders a list of rich-text editors; the team markdown
components map is cached per surface, which was remounting every image on every
render.

**The lint rules (v0.6.51).** `no-palette-literal`, `no-raw-form-control` and
`require-thin-scrollbar`, each unit-tested, behind a warning ratchet. Nine kit
scroll containers fixed first, since they propagate to every menu and table.

---

## 3. Do this next

The audit's worklist is the authority; this is the short version, in its own
order — **these numbers are not the audit's**. Four of the six below are done
and struck through; what is left is 2 and 6, and neither can be finished from a
headless session.

1. ~~**The click-through debt.**~~ **Done 2026-09-08**, against v0.6.66 running
   locally (`pnpm dev:fe`) in front of the dev brain, in a real browser. Every
   claim held, and three were measured rather than eyeballed:

   - **v0.6.48** — before opening: 0 ProseMirror nodes, 0 textareas in the DOM,
     while the editor chunks _were_ fetched. That is the idle prefetch warming
     the code without mounting anything, exactly as designed. On first open: 21
     editors. Those 21 used to be built on every page load.
   - **v0.6.50** — typing a 59-character draft through 3 s of continuous
     streaming (801 → 1,654 chars): focus never left the composer and
     `selectionStart` stayed at the end. A transcript re-rendering per frame
     would have broken both.
   - **v0.6.56** — the live region held `"Morph is Thinking…"` _unchanged_ while
     the reply grew, which is the whole design: the step is announced, never the
     growing reply. On settle it carried the finished reply. `aria-busy` was on
     exactly one node while streaming. Escape returned focus to the opener with
     `focusIsInsideHiddenPanel: false` — the stranded-focus bug, gone. In the
     window shape: `role="dialog"`, `aria-modal="false"`,
     `aria-label="Morph assistant"`, and the grip resized by keyboard to the
     exact expected pixel (4 fine steps + 1 coarse = 560 → 688 px).

   Minimise/restore kept transcript, scroll position and draft. Console across
   the session: no errors, no hydration warnings, nothing but HMR noise.

   **The finding that nearly invalidated the exercise:** the dev box serves
   owner UI **v0.6.42** — the version the audit was run against. Its updater
   tracks GitHub releases, where jackdaw's latest is v0.6.26. None of this
   rollout has ever been deployed; it exists only in git. Testing against that
   box would have exercised the code we spent the whole rollout fixing.

2. **Finish the CSP.** `client/web/lib/csp.ts` already holds
   `buildRuntimeCsp()`, written and unit-tested. It needs to be rendered as a
   `<meta http-equiv>` from the root layout. Read §5 first, because the reason
   it is not a header is not obvious. Then one signed-in pass with the console
   open, exercising the four surfaces that frame, eval or load bytes from somewhere
   unusual: the mini-app sandbox, the drawing canvas, the formula screen, the
   email reading pane.
3. ~~**Tests for the auth and transport core.**~~ **Done**, landed in v0.6.53.
   50 tests across the four modules
   (428 → 478), and the `onExhausted` bug is fixed: `eventStreamCore`'s 404
   branch now ends the stream for consumers that registered one, which is what
   left the team chat and forum spinners up forever on a server with streaming
   off. The auth-failure branch returns early too but is _not_ the same bug —
   both team consumers reconcile from `onUnauthorized`, which fires first.
   The same version carries a security fix; see §6.
4. ~~**Repair the e2e runner.**~~ **Done** in v0.6.58. The runner no longer
   tries to boot a stack that left in the split; it points at a brain
   (`E2E_SERVER_URL=… pnpm e2e`), puts this checkout's owner UI on `:3901` in
   front of it and runs the `split` project. `e2e/stack/docker-compose.yml` is
   gone with the rest. Playwright is a second CI job, conditional on a
   repository variable naming a brain, so it is inert rather than red where
   there is nowhere to point. **What still needs you:** one green run against a
   real brain — the audit's own "done when", and the one thing that cannot be
   checked from here.
5. ~~**The accessibility pass.**~~ **Done** in v0.6.56: the `TurnAnnouncer` live
   region (owner assistant, team chat and the forum), a global
   `prefers-reduced-motion` clamp plus `scrollBehavior()` for the seven JS
   smooth-scrolls a stylesheet cannot reach, focus rings on the seven controls
   that stripped them, and a dialog role, accessible name, focus move and
   keyboard resize on the popout. Still open in this dimension: hover-only
   affordances with no keyboard reveal, native controls where kit ones exist,
   and the mobile-broken screens.
6. **Burn the lint backlog down.** Two thirds done in v0.6.55: 465 → 188, cap
   lowered to match, and `no-palette-literal` (225 → 0) and
   `require-thin-scrollbar` (48 → 0) are now `error`. What is left is
   `no-raw-form-control`, 188 raw `<button>`/`<input>`/`<textarea>` — the one
   of the three that rewrites rendered markup rather than swapping a class, so
   it wants eyes on a running app rather than a scripted pass.

Also open, smaller: the seven medium bugs in the audit's §1; memoising the
individual assistant turn row and rendering settled turns as static HTML;
`desktop.yml` and `release.yml` still pin the deprecated Node 20 action line.

---

## 4. The environment

```sh
pnpm install
pnpm verify                 # typecheck + lint (capped) + format + tests
pnpm -C client/web build    # production build
pnpm dev:fe                 # detached frontend against MANTLE_REMOTE
E2E_SERVER_URL=… pnpm e2e   # owner UI on :3901 in front of that brain, then Playwright
```

`pnpm e2e` creates and deletes content on the brain you name, so name a
throwaway one.

`pnpm dev:fe` reads `client/web/.env.detached.local` and runs the owner UI
against a remote brain with no local database. It reaches the brain fine and
stops at its sign-in screen, which is the whole reason for the click-through
debt in §3.

To measure a bundle change, compare per-route client JS between two builds by
summing the chunks each route's `_client-reference-manifest.js` references.
That is how the 55% figure in §2 was arrived at, and it is more honest than
the build's own summary.

---

## 5. Landmines

Six things measured the hard way. Each cost real time to discover.

**pnpm settings live in `pnpm-workspace.yaml`, not `package.json`.** pnpm 11
reads `overrides` and `patchedDependencies` from the workspace file and
silently ignores the `pnpm` field in package.json. Every override in this repo
was inert, and the katex patch had been unapplied since katex passed 0.18.1.
Fixed in v0.6.43. When you touch dependency pins, edit the workspace file.

**`process.env` is resolved at BUILD time in `next.config.ts` and in
middleware, both runtimes.** This matters because one prebuilt image serves
any brain, so `MANTLE_SERVER_ORIGIN` only exists in the running box's
environment. Measured three ways: a header declared in `headers()` came out
empty while `/env.js` served the same variable correctly; edge middleware was
worse, with the built `.next/server/middleware.js` containing zero references
to the variable; and `runtime: 'nodejs'` plus a dynamic key lookup did not help
either. Server components and route handlers DO read runtime env: their reads
survive into `.next/server/chunks`. So anything runtime-origin-dependent has to
come from a server component, which is why the rest of the CSP is destined for
a meta tag.

**A CSS reduced-motion clamp does not cover JavaScript scrolling.** The
`behavior` option of `scrollIntoView`/`scrollTo` overrides the CSS
`scroll-behavior` property rather than deferring to it, so seven call sites
kept animating under an otherwise-global clamp. They go through
`scrollBehavior()` in `@mantle/web-ui/lib/motion`; any new smooth scroll should
too. Related: clamp animation DURATION, never `animation: none` — `none`
cancels an animation mid-flight and can park an element at a keyframe's start
state, so a Radix popover that animates in from `opacity: 0` simply never
appears.

**The lint gate is a ratchet.** `pnpm lint` runs `--max-warnings 188`. Adding
any new warning fails it. When burning the backlog down, lower the number in
the root package.json; never raise it. Rules are in `eslint-rules/`.

**`no-palette-literal` has a blind spot, and it is deliberate.** The rule only
visits `className` attributes and `cn()`/`clsx()` arguments, so a palette
literal in a lookup map, in a helper that returns a class string, or in a
`'size-4 ' + (...)` concatenation is invisible to it — there were 35 of those
still in the tree when the rule first read zero. They were converted by hand in
v0.6.55, but the blind spot remains: `grep -rE '\b(text|bg|border|fill)-(amber|emerald|rose|sky|green)-[0-9]'`
is the check the linter cannot do for you. Widening the visitor changes what
fails CI, and the rule's own header says it accepts false negatives on purpose.

**Mermaid must not come back by half.** Removing it needed both doors closed:
`aiEnabled={false}` on the Excalidraw canvas AND the stub at
`stubs/mermaid-to-excalidraw` wired through the workspace overrides. Excalidraw
reaches the feature through a dynamic `import()`, so hiding the UI alone leaves
the package installed and its chunk emitted.

**`react-hooks/exhaustive-deps` is an `error` here, and that is a tool.** It is
what made moving 205 lines of JSX into a `useMemo` safe in v0.6.50: write an
empty dependency array, let ESLint compute the real list, apply it verbatim. Use
that when a similar move comes up rather than reasoning the list out by hand.

**One more, from the assistant work.** The panel's doc comment claimed the eager
mount bought three things. Two of them did not depend on the mount at all:
surface selections always wrote to `AssistantDockProvider`, not the panel. Read
what a comment claims against what the code does before treating it as a
constraint.

---

## 6. The one thing the first pass got wrong

**`safeNext()` was still an open redirect.** The v0.6.44 fix tested the first
two characters of `?next=` — starts with `/`, but not `//` or `/\` — and that
is not the reading the browser applies. `new URL()` strips tab, LF and CR from
anywhere in its input _before_ parsing, so a control character between the
slashes walks past the test:

```
"/\n//evil.example"   passes the guard   ->   https://evil.example/
```

Reachable as `/login?next=%0A%2F%2Fevil.example`, and Next completes it: the
app router's `isExternalURL` is `url.origin !== location.origin` over
`new URL(addBasePath(href), location.href)`. Fixed in v0.6.53 by resolving
against an `.invalid` base and comparing origins, which is what the desktop shell's `inAppUrl()` already did
— and exactly why `deepLinkToPath`'s twin of the bug was never exploitable.
It carries the same flawed regex; the origin re-check after resolution is what
saves it.

**The lesson, which generalises past this bug:** when a guard's whole purpose
is to predict what a URL parser will do with a string, do not pattern-match
the string. Hand it to the parser and check the answer. The parser normalises
in ways no regex anticipates, and it is the parser's reading that the browser
acts on.
