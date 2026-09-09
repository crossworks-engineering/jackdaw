# Handover: verifying the rollout, and the gap between git and the box

Written 2026-09-09, at v0.6.66. Two things this records that nothing else does:
**how to put current code in front of a real signed-in session**, and **the
fact that none of the rollout has ever been deployed.**

Companions, both still current:

- `docs/handover-frontend-audit.md` — the audit rollout: what landed, what is
  left, and eight landmines measured the hard way.
- `docs/handover-structure.md` — the structure pass, phases 0-2 done.

---

## 1. The deployment gap — found, and closed

**It is closed.** Read this anyway, because the shape of it will recur.

When this session started, the dev box served owner UI **v0.6.42** — the version
the audit was run _against_ — while main was at v0.6.66. The natural reading was
"nobody cut the tags". That was wrong, and the real cause is worth knowing:

- Tags **were** cut, all the way to v0.6.42, and pushed.
- The release workflow **succeeded every time**.
- It creates a **draft** release, and publishing a draft is a separate manual
  step. That step had not happened **21 times**.
- The box's updater reads _published_ releases, so it saw v0.6.26 — the last one
  anybody had published, in August.

So the work was built, tagged and sitting in drafts nobody could install.

Closed on 2026-09-09: **v0.6.67 tagged, built, published as Latest**, carrying
twenty-five versions in one step. The 21 stale drafts were deleted (releases
only — all 49 tags survive as history).

**What to check next time, in order:** the interface version on the box
(`/settings/updates`), then `gh release list` for drafts, then `gh run list`.
A green pipeline and a stale box are not a contradiction.

This nearly invalidated the click-through: it was about to be run against that
box, and would have exercised precisely the code the rollout spent itself
fixing. **Check the interface version before trusting any signed-in test.**

## 2. The test rig

This repo is the client. It cannot start a brain, so it points at one.

```sh
# client/web/.env.detached.local — one line, gitignored
MANTLE_REMOTE=<brain origin>

pnpm dev:fe            # owner UI on :3000 against that brain
```

Then sign in at `http://localhost:3000/login` with that brain's credentials.
The local client is a **separate origin** from the brain, so it authenticates
by bearer rather than cookie — the split topology, not the same-origin one the
default deployment uses. That is extra coverage, but it means a same-origin-only
bug will not show here.

**As of this handover the rig is left running** on `:3000`, pointed at the dev
brain. `.env.detached.local` previously named a workstation on `:3999` that was
not answering; a copy of the original line is in the session scratchpad, and it
is one line to put back.

**Verifying from the console beats verifying by eye.** Everything in §3 was
measured with `javascript_tool` against the live DOM rather than read off a
screenshot — the DOM before first open, `selectionStart` through a stream, the
live region's text while the reply grew. A screenshot would have shown all of
it "working" and proved none of it.

## 3. What is verified, and how

All against v0.6.66 in a real browser, 2026-09-08.

| Claim                                         | Version | Evidence                                                                                                                                                                                |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel not mounted until first open            | v0.6.48 | 0 ProseMirror nodes and 0 textareas in the DOM before opening, **21 after** — while the editor chunks were already fetched, which is the idle prefetch warming code without mounting it |
| Transcript holds still while typing           | v0.6.50 | a 59-char draft through 3 s of streaming (801 → 1,654 chars): focus never left the composer, `selectionStart` never moved off the end                                                   |
| Live region announces the step, not the reply | v0.6.56 | announcer held `"Morph is Thinking…"` **unchanged** while `replyChars` climbed; carried the finished reply on settle                                                                    |
| `aria-busy` while streaming                   | v0.6.56 | exactly one node, for the length of the turn                                                                                                                                            |
| Focus returns to the opener                   | v0.6.56 | Escape → `activeElement` is `"Toggle assistant (⌘I)"`, `focusIsInsideHiddenPanel: false`                                                                                                |
| Popout is a dialog                            | v0.6.56 | `role="dialog"`, `aria-modal="false"`, `aria-label="Morph assistant"`                                                                                                                   |
| Grip resizes by keyboard                      | v0.6.56 | 4 fine steps + 1 coarse: 560 → **688 px**, exactly the predicted arithmetic                                                                                                             |
| `?next=` cannot smuggle an origin             | v0.6.53 | `?next=%0A%2F%2Fevil.example` reaches the component as `"$undefined"`; `?next=/tasks` passes through                                                                                    |
| No hydration mismatch on /files               | v0.6.64 | two full reloads, console clean                                                                                                                                                         |

Minimise/restore kept transcript, scroll position and draft. Console across the
whole session: no errors, no warnings, no hydration complaints.

## 4. What is NOT verified

- **The CSP's runtime half.** `buildRuntimeCsp()` is written and unit-tested and
  **still not emitted**. Finishing it is a `<meta http-equiv>` from the root
  layout — read `docs/handover-frontend-audit.md` §5 first, because the reason
  it cannot be a header is not obvious — then one pass with the console open
  over the four surfaces that frame, eval or load bytes from somewhere unusual:
  the mini-app sandbox, the drawing canvas, the formula screen, the email
  reading pane. A CSP fails closed and silently, so the console is the test.
- **The e2e suite going green.** The runner works (`E2E_SERVER_URL=… pnpm e2e`)
  and was verified as far as a stub brain allows. It has never been run against
  a real one. It **creates and deletes content** — throwaway brains only.
- **Anything same-origin-only.** The rig is split topology; the default
  deployment is one origin path-routed.
- **`assistant-client` phase 2.** Deliberately not started. The click-through
  that gated it is now done, so it is unblocked — see §5.

## 5. Where to pick up

1. ~~Decide about deploying.~~ **Done** — v0.6.67 is published. See §1.
2. **Finish the CSP** — the code half can land now; the click-through needs the
   rig in §2.
3. **`assistant-client` phase 2** — now unblocked. `docs/handover-structure.md`
   has the order and the traps. It is the last of the four screens, and the
   riskiest: the live turn stream, the reconciliation, and an open
   double-reconciliation bug in the audit's §1.
4. **One green `pnpm e2e`** against a throwaway brain.
5. **The 188 `no-raw-form-control` warnings** — the last lint backlog, and the
   one that rewrites rendered markup rather than swapping a class, so it wants
   eyes on a running app.

## 6. Landmines from this session

**Check the interface version before any signed-in test.** Settings → Updates,
or `/settings/updates`. See §1.

**`turnStreaming: ""` in `/env.js` means ON, not off.** The flag is an _off_
switch: unset or empty is on, and only `0/false/off/no` disables it. It reads
alarming in the env payload and is not.

**The a11y tree cannot tell "not mounted" from `display:none`.** Both are
absent from it. Verifying the lazy mount needs a DOM query
(`document.querySelectorAll('.ProseMirror').length`), not `find` or a
screenshot.

**`evil.example` appearing in the login HTML is not a leak.** Next serialises
the raw `searchParams` into the flight payload — the canonical URL, the query
string, the page cache key — no matter what the component does with them. What
matters is the prop the component actually receives: `"next":"$undefined"`.
Grepping the HTML for the hostname will mislead you.

**Console tracking starts when you first ask for it.** Reading console messages
before subscribing returns nothing and looks like a clean console. Subscribe,
then reload, then read.
