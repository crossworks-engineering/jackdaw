# Handover: UI consistency, after the Tasks rebuild (2026-08-17)

`/tasks` was rebuilt into the reference implementation for the style guide, and
the rules it establishes were written into
[`ui-style-guide.md`](./ui-style-guide.md). The next job is rolling those rules
across the rest of the app, per
[`plans/workspace-screen-consistency.md`](./plans/workspace-screen-consistency.md).

**Start with the UI tests. The reasoning is in §1 — please read it before
picking up a screen.**

This supersedes `docs/handover-tasks-kanban.md` in the **mantle** repo, which
described the landing sequence that has now happened.

---

## 1. Do this first: pin the Tasks UI with e2e tests

There is a Playwright suite (`e2e/`, 14 specs, `pnpm e2e` runs a hermetic
cycle: throwaway stack → suite → wipe). **None of them touch `/tasks`** — the
most-changed screen in the app has zero UI coverage.

Everything on Tasks was verified **by hand, once, in a browser**. That was
enough to know it worked; it is not enough to keep it working while 24 other
screens are edited to match it. The rollout will touch shared primitives
(`Button`, `Input`, `Textarea`, `Field`, `MasterDetail`, `RailHandle`), and a
regression in any of them lands on Tasks silently.

Two of the rules below were **written and broken within this same session**,
which is the honest argument for doing this first.

The precedent to copy is `e2e/specs/editor-header.spec.ts`: it pins a layout
fix with a hard pixel budget and a same-row assertion, so a padding regression
fails loudly rather than quietly.

What is worth pinning, roughly in value order:

| # | Behaviour | Why it needs a test |
|---|---|---|
| 1 | Reordering a **blocked** card inside In progress does **not** clear the flag | The pure helper `statusForDrop` is unit-tested, but the drag path that calls it is not. I could not make a synthetic drag fire; Playwright can. |
| 2 | A long title truncates and the header actions stay inside the pane | Verified once by hand with a 130-char title. Exactly the `editor-header.spec` shape: measure, budget, assert. |
| 3 | Archive removes a task from list **and** board, and restore returns it | Spans client + API + the `taskConds` default. The highest-value single test in the list. |
| 4 | Tick a Blocked task, untick it, it returns to **Blocked** | Pure client state (a `useRef` map), easy to break in a refactor, invisible when broken. |
| 5 | Panel widths persist across a reload; rail widths persist via cookie | Two different mechanisms (localStorage vs cookie), both easy to regress. |
| 6 | No element that reads `--nav-w` / `--activity-w` declares a transition on that property | See landmine 1. A repo-wide assertion would be better than a per-screen one. |

Items 1–4 are behaviour. 5–6 are closer to guards; if they are awkward in
Playwright, item 6 is a good candidate for the lint/scan work in phase 4 of the
rollout plan instead.

---

## 2. Where things stand

| Repo | Branch | State |
|---|---|---|
| **mantle** | `main` | **Pushed.** `v0.230.67` tagged; CI published `@crossworks/*@0.230.67` to npm. |
| **jackdaw** | `main` | **Merged, NOT pushed.** 6 commits ahead of origin — that includes a pre-existing `thinking-orbs` commit that was already unpushed before this session. |

The `file:` pins the Kanban branch carried are **gone**. All five contract
packages are on `0.230.67`, and `pnpm verify` passes with `--frozen-lockfile`,
so jackdaw builds from npm exactly as CI would.

**Not done, both deliberate:**

- `git push` in jackdaw.
- The client release pair (client-pair bump + a patch mantle release, per
  `update-prod.md`). That is what actually ships the UI, and it is a separate
  decision from the merge.

Nothing is deployed to dev or prod.

---

## 3. The environment

The dev client runs on the Mac; the brain runs on the Linux workstation as a
**separate checkout**. Editing server code on the Mac does not reach it — rsync
first, or you are testing the old code.

```sh
# Brain (workstation, scratch Postgres in the kanban-pg-scratch container)
ssh jasons@192.168.100.75 'cd /tmp/kanban-mig-verify/server/web && \
  PORT=3999 setsid nohup pnpm dev >> /tmp/kanban-brain.log 2>&1 < /dev/null & disown'

# Client (Mac) — .claude/launch.json entry "jackdaw-detached", or:
MANTLE_SERVER_ORIGIN=http://192.168.100.75:3999 pnpm -C client/web dev
```

The brain has died once already (`[ELIFECYCLE] Command failed` in
`/tmp/kanban-brain.log` after a burst of `tsx watch` restarts). If the UI shows
a shell with no data, check port 3999 before suspecting the client.

⚠ The scratch brain has **no agents, workers or heartbeats provisioned**, so
most settings forms never render on it. Those screens are the largest cluster
in the rollout and carry most of the app's `FieldHint` usage — check them
against a brain with real data, not this one.

---

## 4. Landmines

1. **Never transition a property you read from a CSS variable.** An element
   that does stops tracking the variable entirely: Chrome keeps the old
   computed value and it sits frozen. Seven shell elements did this; the
   variables animate now and the consumers just follow. Full note in
   `client/web/app/globals.css`.
2. **`@property` `initial-value` must be px, never rem.** A registered custom
   property's initial value has to be computationally independent, and `rem`
   depends on the root font size. `16rem` invalidates the rule **silently** —
   no error, the property simply stays unregistered. `0rem` survives, which is
   what makes it look half-working.
3. **Archiving must never re-index.** `archivedAt` is deliberately absent from
   `updateTask`'s `contentChanged` check. Put it back in and filing a thousand
   finished tasks away clears a thousand embeddings and queues a thousand
   extractor passes.
4. **The board's column ≠ the status written.** Blocked cards render under In
   progress, so a plain reorder must not post `in_progress`. `statusForDrop`
   owns that decision and is unit-tested; keep it that way.
5. **`open` still does not mean "not done".** Anything filtering tasks by
   status equality wants the `active` filter (`<> 'done'`). Inherited from the
   previous handover and still true.

---

## 5. Then: the rollout

[`plans/workspace-screen-consistency.md`](./plans/workspace-screen-consistency.md)
has the full plan. In short:

1. **Shared foundation** — `Input` is missing `text-base md:text-sm` (the iOS
   zoom guard `Textarea` has); extract a shared `CommentThread` before the
   owner and member threads drift further apart (they diverged again today);
   retire the second delete idiom.
2. **The 24 master-detail screens** → port to `<MasterDetail>`. Events first.
3. **Non-master-detail surfaces** — the assistant dock's raw `<textarea>` is
   the last fat scrollbar in the app; Mail persists panel layout by cookie
   instead of `useDefaultLayout`.
4. **Guards last** — a lint rule banning raw `<textarea>`/`<input>`, a computed
   `scrollbarWidth` scan, a rule against `size-N` on Buttons. Last on purpose:
   a rule that fails on 24 screens is a rule someone disables.
