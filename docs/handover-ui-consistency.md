# Handover: the UI consistency rollout (2026-08-17, second session)

`/tasks` is the reference implementation for
[`ui-style-guide.md`](./ui-style-guide.md). The job is rolling its rules across
the rest of the app, per
[`plans/workspace-screen-consistency.md`](./plans/workspace-screen-consistency.md).

**Phase 1 is done. Phase 2a is DONE — 9 of 9.** The plan
document is the authority on what is left and what the ports taught us — read
its §2a table before picking up a screen. This file is the state of the world
around it.

This supersedes the first handover of the same name; §1 of that one (write the
Tasks e2e tests) is finished and its content now lives in §1a below.

---

## 1. Where things stand

| Repo | Branch | State |
|---|---|---|
| **mantle** | `main` | Pushed. `v0.230.67` tagged; `@crossworks/*@0.230.67` on npm. |
| **jackdaw** | `main` | **15 ahead of origin, unpushed.** Everything below is merged here. |

**No unmerged branches.** Both rollout branches are in; the worktrees that carried
them (`mantle-recall-skill-mentions-aad14e`, `heuristic-curie-9c542d`) are
redundant and can be removed.

```
3ddfcf5 Merge: /formulas port — phase 2a now 8 of 9
d15c79c fix(ui): follow the app theme on the React Flow canvases   ← not the rollout
67fe033 docs: make the wrong-worktree check a command, not a hint
b74b03b docs: bring the handover up to date after the /formulas port
1ca0c6b refactor(formulas): port /formulas to the Tasks standard
706f9d5 Merge: UI consistency rollout — phase 1 and 2a (7 of 9)
b384e91 docs: handover for a fresh session
8b52101 refactor(models,runs,sandboxes): port the last three clean 2a screens
1310d43 docs(ui): record what blocks /apps and the shape of the rest of 2a
b9a7f66 refactor(secrets): port /secrets to the Tasks standard
3cd5e90 refactor(journal): port /journal, and fix saving on the detached client
72bb77e refactor(contacts): port /contacts to the Tasks standard
66de53d refactor(events): port /events to the Tasks standard
81e5404 feat(ui): finish the shared foundation — phase 1
ba2a9cf test(tasks): pin the Tasks UI and the resizable shell with e2e specs
```

`d15c79c` landed directly on `main` from outside this rollout (React Flow
canvases following the app theme). It is unrelated, but it is in the same
unpushed pile, so a push ships it too.

`pnpm verify` is clean. The e2e suite is 71 passing / 2 failing / 51 skipped —
see §4 for which and why. Both failures are the SAME test, once per project.

**⚠ Nothing is pushed or deployed.** Fifteen commits of unreviewed work is the
largest outstanding risk here, and it is Jason's call, not a coding decision.
The specs exist to make that review cheap.

---

## 2. What landed this session

### Phase 1 — the shared foundation (`81e5404`)

- **`Input` carries the iOS zoom guard** (`text-base md:text-sm`). Under 16px,
  iOS Safari zooms on focus and does not zoom back. `Textarea` had it for a long
  time; `Input` never did.
- **`CommentThread` extracted** to `packages/web-ui/src/comment-thread.tsx`. The
  owner and member threads had already drifted (composer top vs bottom, newest
  vs oldest first). Presentation only — the owner keeps `apiFetch` + SSE, the
  member keeps `teamFetch` + a 30s poll. `onDelete` is **omitted** on the member
  surface, so moderation is absent rather than disabled.
- **The always-red delete idiom is retired** — 14 buttons across 13 files. Two
  non-delete, text-only buttons stay red on purpose; §8 records why so nobody
  "finishes" the sweep.

### Phase 2a — 9 of 9 screens, complete

`events`, `contacts`, `journal`, `secrets`, `models`, `runs`, `sandboxes`,
`formulas`, `apps`. The `apps` blocker is resolved — `MasterDetail` learned
`listCollapsed` (a zero-width but still-MOUNTED list, for focus mode) and
`detailFills`. Both are opt-in; the other eight screens are untouched.

Per-screen detail is in the commits. The transferable lessons are in the plan's
§2a "what the ports taught us" list; do not re-derive them.

### Four real bugs, all found by writing the tests

1. **`/tasks` and `/events` opened a composer on every cold load.** The
   default-selection effect read an empty local list and set create mode, which
   is never revisited. Only a warm React Query cache hid it, which is why
   hand-testing missed it both times.
2. **Saving a journal entry did not work at all** on the detached client. The
   editor posted with a bare `fetch('/api/journal')` — the CLIENT origin, which
   has no `/api` routes — so every save redirected to `/login` and was lost. It
   was the last raw `fetch('/api/…')` in the client.
3. **`DateTimePicker` could not render an invalid state**, so a form whose only
   bad field was a date went red nowhere. It forwards `aria-invalid` now.
4. **A `getComputedStyle`-based transition guard is silently vacuous** — see
   landmine 6.

---

## 3. Do this next

**Read the plan's §2a table first.** Then, in preference order:

1. **Phase 2b, the 12 settings screens** — the largest cluster and the most
   forms, so the most §6a/§6b value. Also the ones that need a brain with real
   data (§4). Expect the `formulas` lesson to repeat: a screen with its own
   form helper has usually skipped `htmlFor` altogether.
2. **Phase 2c**, then phase 3. `pages` and `draw` still use `focusGridClass`
   directly; `MasterDetail` can now express what they need (`listCollapsed`,
   `detailFills`), but the plan's advice not to force the master-detail shape
   onto an editor still stands — the capability existing is not a reason.

`/formulas` also still wants `listCollapsed`: its editor replaces the whole
screen, so opening it unmounts `MasterDetail` and loses the list's scroll
position. The primitive can express that now; nobody has wired it.

Phase 4's lint rules stay last, as the plan says: a rule that fails on 20
screens is a rule someone disables.

### Two loose threads worth closing

- **`/sandboxes` has never been rendered in a browser.** The `sandboxes` compose
  profile is off on the scratch brain, so it shows its "not enabled" explainer
  and the spec row skips itself. Typechecked and structurally identical to
  `runs`, but unverified.
- **The member comment thread has never been rendered in a browser** either.
  `team.spec.ts` cannot run on the scratch brain, so `TeamTaskComments` is
  covered only by the typechecker and by sharing its component with the owner
  path, which IS covered.

---

## 4. The environment

The dev client runs on the Mac; the brain runs on the Linux workstation as a
**separate checkout**. Editing server code on the Mac does not reach it.

**The brain's CORS allowlist is only `localhost:3000`, `:3001`, `:3100`**
(`MANTLE_API_CORS_ORIGINS` in its `.env.local`). Serve the client on one of
those three or every fetch fails with `Failed to fetch` and the screen renders a
shell with no data. `:3000` is often already taken and `:3001` is a mantle API
server, so **`:3100`** is the one to use.

```sh
# Brain (workstation; scratch Postgres in the kanban-pg-scratch container).
# It leaves a stale `tsx watch` supervisor behind when it dies, and that
# supervisor respawns the OLD code — so always kill before starting.
ssh jasons@192.168.100.75 'pkill -f "tsx watch server/main.ts"'
ssh jasons@192.168.100.75 'cd /tmp/kanban-mig-verify/server/web && \
  PORT=3999 setsid nohup pnpm dev >> /tmp/kanban-brain.log 2>&1 < /dev/null & disown'

# Client (Mac), from the worktree you are working in:
MANTLE_SERVER_ORIGIN=http://192.168.100.75:3999 PORT=3100 pnpm -C client/web dev

# The suite, split topology:
E2E_SERVER_URL=http://192.168.100.75:3999 E2E_CLIENT_URL=http://localhost:3100 \
E2E_EMAIL=audit@example.com E2E_PASSWORD=e2e-owner-password-1 \
E2E_SKIP_PDF=1 pnpm -C e2e e2e
```

⚠ **Check WHICH worktree the running client is serving, not just that a client
is running.** Every worktree's dev server looks identical on `:3100`, so one
left over from another worktree answers perfectly happily and serves *that*
worktree's code: your edits appear to do nothing and the suite grades the wrong
tree. And you cannot sidestep it by taking another port — the CORS allowlist is
only 3000/3001/3100. Ask the listening process where it actually lives:

```sh
lsof -a -p "$(lsof -tiTCP:3100 -sTCP:LISTEN | head -1)" -d cwd -Fn
```

Restarting it on the same port from your own worktree is the fix — the port
matters, the process does not.

⚠ **`next dev` writes `client/web/AGENTS.md` and `client/web/CLAUDE.md`** on
every boot. They arrive untracked; they are not part of anyone's change. Decide
once whether to track them (their own text argues for it) — until then, leave
them out of your `git add`.

⚠ **A fresh worktree has no `node_modules`.** `pnpm install --frozen-lockfile`
takes a few seconds off the store, but nothing — not `tsc`, not the dev server —
works before it.

The scratch brain's owner is `audit@example.com`. **Its password was reset to
the suite's own** (`e2e-owner-password-1`, bcrypt cost 12) because the original
was lost with the session that created it and signup is refused once an anchor
owner exists. The previous hash is at `/tmp/scratch-owner-hash.bak` on the
workstation. Disposable DB; a real box would want its own credentials.

⚠ The scratch brain has **no agents, workers or heartbeats provisioned**, and
`sandboxes` + `MANTLE_RUNS` are off. So: most settings forms never render, and
`/sandboxes` shows an explainer. Phase 2b is exactly that cluster — check it
against a brain with real data, not this one.

**Suite status on this brain:** 71 pass, 51 skip, 2 fail — both projects, one
`pnpm -C e2e e2e` run.

- Skipped: most of the suite under `same-origin` (every spec added by this
  rollout is `split`-only, and skips itself there), plus the PDF spec
  (`E2E_SKIP_PDF=1`, no browserless sidecar) and the `/sandboxes` row (feature
  off — it skips out loud, because a silent skip reads like a pass).
- Failing: `team.spec.ts`, once per project. It mints a contact team token and
  the gate never renders. **Pre-existing**; re-checked with all of this work
  stashed and it fails identically. It is the missing provisioning above, not
  a regression.

⚠ **`field-primitives.spec.ts` is intermittent — roughly one full run in two.**
It creates a task through the API and then searches for it by title, and the
comment composer it measures only renders once that row is found and selected.
Under a full run the brain does not always have the row indexed inside the 5s
locator timeout, so the Textarea never appears and the spec fails claiming the
iOS zoom guard is gone. It is not: the same spec passes in isolation
(`-g "field primitives"`) and passed on the next full run unchanged. **Do not
"fix" the guard when you see this.** The spec is what needs hardening — it
should select the task by id rather than trusting search to have caught up.

---

## 5. Landmines

The first five are inherited and still true. 6–9 are new.

1. **Never transition a property you read from a CSS variable.** The element
   stops tracking the variable: Chrome keeps the old computed value and it sits
   frozen. Animate the VARIABLE (`.mantle-shell`, `globals.css`); the consumers
   follow. Full note in `client/web/app/globals.css`.
2. **`@property` `initial-value` must be px, never rem.** A registered custom
   property's initial value must be computationally independent. `16rem`
   invalidates the rule **silently** — no error, the property simply stays
   unregistered. `0rem` survives, which is what makes it look half-working.
3. **Archiving must never re-index.** `archivedAt` is deliberately absent from
   `updateTask`'s `contentChanged` check. Put it back and filing a thousand
   finished tasks away clears a thousand embeddings.
4. **The board's column ≠ the status written.** Blocked cards render under In
   progress, so a plain reorder must not post `in_progress`. `statusForDrop`
   owns that and is unit-tested; keep it that way.
5. **`open` still does not mean "not done".** Filtering tasks by status equality
   wants the `active` filter (`<> 'done'`).
6. **Never assert a transition from `getComputedStyle` in a Playwright test.**
   Playwright injects `*, ::before, ::after { transition: none !important }`, so
   every computed `transition-property` reads `none` under test and the
   assertion passes whatever the app does. Read the authored rules out of
   `document.styleSheets` — `shell-layout.spec.ts` does, with the reasoning
   inline. **The first version of that guard passed with the landmine-1 bug
   deliberately put back.**
7. **A `<form>` outside a `<form>`.** `SubmitButton` renders `type="submit"`.
   Contacts' detail is not a `<form>`, so it passes `type="button"`. Check which
   you are in.
8. **A vertical `Field` stretches its direct children** (`*:w-full`). A small
   "+ Add another" button becomes a full-width bar. Wrap it in a plain `<div>`;
   do not fight it with `w-fit`, which lands at the same specificity and wins or
   loses by source order. §6a warns about this now.
9. **A detail pane must not bring its own scroller.** `MasterDetail` owns one; a
   preview that keeps `h-full min-h-0 overflow-y-auto` nests a second, which
   paints two bars and sticks a `sticky` header to the wrong one.

---

## 6. How the tests are organised

`e2e/` runs against a LIVE stack, two projects (`same-origin`, `split`). Every
spec added this session is `split`-only — the owner UI lives on the client app.

| spec | holds |
|---|---|
| `tasks.spec.ts` | the reference screen's behaviour + the shared `CommentThread` |
| `events.spec.ts` | §6b validation moving between four controls; the §8 header |
| `contacts.spec.ts` | a form-only screen; email validation announced, not just outlined |
| `journal.spec.ts` | **the save round-trip through the brain** (bug 2 above) |
| `secrets.spec.ts` | both former raw `<select>`s; edit reusing the create surface |
| `shell-layout.spec.ts` | rail + panel width persistence; the CSS-var transition guard |
| `field-primitives.spec.ts` | `Input`/`Textarea` font size at 375px and 1280px |
| `formulas.spec.ts` | the §8 header; §6b on the evaluator AND on the editor's YAML view |
| `master-detail-screens.spec.ts` | **table-driven across all 9 ported screens** |

Two habits worth keeping:

- **Add a row, not a file.** A scaffold-only port needs one line in
  `master-detail-screens.spec.ts`. Keep per-screen specs for ports that change
  behaviour.
- **Verify every guard against the bug it exists for**, before committing:
  revert the fix, watch the test fail, put it back. Landmine 6 is the whole
  argument — that guard looked fine and asserted nothing. Also beware the
  vacuous pass in the other direction: `tasks.spec.ts` asserts the board drag
  changed a `rank`, because a synthetic drag that never registers leaves the
  status untouched and the assertion green.
