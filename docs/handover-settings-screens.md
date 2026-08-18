# Handover: the settings cluster, and the screens the plan missed (2026-08-18)

Phase 2a and the resizable-column work are **done**: fifteen screens are on
`<MasterDetail>`, every hand-rolled resizer in the app is gone, and both shell
rails draw a grip at rest.

What is left is the settings cluster and a short tail the original plan never
listed. **This batch is not like the last one.** The last fifteen were mostly
scaffold swaps; these carry the app's forms, so the §6 work is the bulk and the
divider is the easy part.

Read [`ui-style-guide.md`](./ui-style-guide.md) §6 (forms) and §8 (layout)
first, and [`handover-ui-consistency.md`](./handover-ui-consistency.md) §5 (nine
landmines) before touching `packages/web-ui`.

---

## 1. First, one decision Jason has already made: `/pages`

**Retire the narrow/wide control. The divider is the measure.**

`/pages` currently declares its reading width twice — the new `MasterDetail`
divider, and a shipped per-page toggle that predates it. Jason's call: the
toggle goes, the content sits **tucked left with the resize on its right**, the
way every other workspace now behaves.

What that means concretely:

There are **two copies of this control, in two files** — confirmed, not assumed:

| what | where |
|---|---|
| Preview toggle (`StretchHorizontal`, `aria-label="Toggle full width"`) | `pages/pages-client.tsx:1074–1083`, inside `PagePreview` |
| The measure it drives | `pages-client.tsx:1130` — `mx-auto w-full` + `max-w-3xl` / `max-w-none` |
| `applyWidth()` → `PATCH /api/pages/:id { width }` | `pages-client.tsx:1020–1029` |
| **Editor toggle** (`<StretchHorizontal /> Full width`) | `pages/[id]/page-detail-client.tsx:970` |
| Its own `applyWidth`, same PATCH | `page-detail-client.tsx:442–446` |
| The stored value both write | `data.width` on the page node, `'narrow' \| 'wide'` |

- **Drop `mx-auto`.** That is what "tucked left" means — §8 already says a
  detail pane hugs the divider and never centres.
- **`/pages` keeps `detailFills`.** It is what makes the divider the real
  measure, and without it focus mode hands the freed width to an empty spacer
  rather than to the page.
- ⚠ **The editor's copy is the open question.** `/pages/[id]` is a full-page
  route with no divider, so removing its toggle leaves it with no width choice
  at all. Jason's "the full width button can fall away" was said about the
  workspace; **the editor was not discussed.** Decide deliberately and record
  which you chose: either the editor keeps its toggle (and `data.width` lives
  on, now written from one place instead of two), or it goes too and the editor
  takes a fixed measure. Do not remove only one and leave a stored field that
  nothing writes.
- **Leave the `data.width` field on the server alone** either way. Removing a
  stored field is a mantle change and a migration; this is a client port.
- The `xl` outline rail is not part of this — leave it.

---

## 2. The full remaining inventory

The plan listed twelve settings screens plus `docs` / `team-admin` /
`team-section`. A sweep for hand-written list scaffolds found **three more it
never mentioned**. This table is that sweep, not the plan.

### 2b — the settings cluster (12)

Widths split 340/360 for no reason anyone recorded; keep each screen's existing
width rather than snapping to the 340px default.

| screen | lines | width | `<Label` | `FieldHint` |
|---|---|---|---|---|
| `settings/agents` | **1983** | 340px | 16 | 31 |
| `settings/heartbeats` | 1005 | 360px | 17 | 31 |
| `settings/users` | 956 | 340px | 7 | 15 |
| `settings/tools` | 833 | 360px | 14 | 25 |
| `settings/peers` | 698 | 340px | 3 | 6 |
| `settings/keys` | 610 | 340px | 4 | 7 |
| `settings/config` | 472 | 360px | 0 | 0 |
| `settings/skills` | 469 | 360px | 5 | 10 |
| `settings/ai-workers` | 460 | 340px | 0 | 0 |
| `settings/tool-groups` | 454 | 360px | 4 | 8 |
| `settings/accounts` | 404 | 340px | 0 | 0 |
| `settings/worker-groups` | 380 | 360px | 4 | 7 |

`<Label` is the §6a signal: a raw `<Label>` beside a control means the screen
stacks `div`s instead of composing the `Field` family. `FieldHint` counts show
where §6d's "every settings field carries a hint" already holds — roughly 140
hints across the cluster, which is why the plan called this the highest-value
§6 work in the app.

**`accounts`, `ai-workers` and `config` import nothing from `ui/field` at all.**
Check whether they genuinely have no form or hand-roll one entirely.

### 2c + the tail the plan missed

| screen | file | scaffold | note |
|---|---|---|---|
| `team-admin` | `team-admin/page.tsx` | `md:grid-cols-[340px_1fr]` **×2** | 1082 lines, TWO scaffolds in one file — two `MasterDetail`s with different `id`s, or one reused view |
| `traces` | `traces/traces-client.tsx` | `md:grid-cols-[minmax(340px,400px)_1fr]` | a RANGE, not a fixed width — becomes `minListSize`/`maxListSize` |
| `runners` | `runners/runners-client.tsx` | `md:grid-cols-[minmax(340px,400px)_1fr]` | same shape as traces; do them together |
| `apps/[id]` | `apps/[id]/app-detail-client.tsx` | `grid-cols-[200px_minmax(0,1fr)]` | the app EDITOR, not the list — `/apps` itself is done |
| `debug/context` | `debug/context/context-client.tsx` | `md:grid-cols-[1fr_1.4fr_1fr]` | **THREE columns.** Not master-detail. Leave it, or decide separately |

`docs/layout.tsx` and `team-workspace/team-section` are already handled —
`docs` was ported, and `team-section` carries no list scaffold.

---

## 3. What makes this batch different

The last fifteen ports were "swap the grid, keep the contents". These are not.

- **The §6 work is the job.** Scaffold → `<MasterDetail>` is an hour; bringing
  1983 lines of agent forms onto `Field`/`FieldLabel`/`FieldDescription`/
  `FieldError` is the rest of the week. Budget accordingly, and do NOT batch
  four settings screens into one commit the way the scaffold-only ports were
  batched.
- **Expect the `formulas` lesson to repeat.** A screen with its own form helper
  has usually skipped `htmlFor` entirely — formulas had ~40 labels naming no
  control. The fix that scales is a render prop: the wrapper mints the id and
  hands it down (`{(f) => <Input {...f} … />}`), so the association cannot be
  forgotten one field at a time.
- **The settings editors still carry `Trash2 + "Delete"` text labels**, which
  §8 retired (delete is an icon-only ghost, grey until hover, `icon-*` twin,
  delete last). Phase 1 deliberately left the labels and only fixed the colour.
- **Switches live in the header, not the form body** — Enabled,
  Default-for-kind and friends. §8's master-detail rules say so explicitly.
- ⚠ **This cluster needs a brain with real data.** The scratch brain has **no
  agents, workers or heartbeats provisioned**, so most of these forms never
  render on it. That is the single biggest practical obstacle here and it is
  why the plan kept deferring them. Sort the data before the code, or you will
  be typechecking blind.

---

## 4. Coverage

Same rules as the last two batches:

- **A scaffold-only port is ONE ROW** in
  `e2e/specs/master-detail-screens.spec.ts` — panes exist, width persists under
  a per-screen key, the detail pane owns at most one scrollbar, and the screen
  server-renders without bailing to the client.
- **A port that changes behaviour gets a per-screen spec.** For this batch that
  means the §6b validation work: assert the failure lands on the control at
  fault (`data-invalid` on the `Field`, `aria-invalid` on the control,
  `role="alert"` on the message, and `aria-describedby` pointing at it), not as
  a red line at the foot of the form.
- **Verify every guard against the bug it exists for**: revert the fix, watch
  the test fail, restore it.

Two traps this rollout has already paid for:

- **The one-scrollbar check is vacuous on an empty screen.** It only counts
  elements where `scrollHeight > clientHeight`. Put enough rows in front of it
  to overflow before you believe it — and note it cannot be falsified at all on
  a screen whose `h-full` chain prevents both panes overflowing.
- **`pnpm -C e2e e2e -- -g …` silently drops the filter** and runs the whole
  suite. Use
  `pnpm -C e2e exec playwright test --project=split <file>` instead.

---

## 5. Environment

Full detail in [`handover-ui-consistency.md`](./handover-ui-consistency.md) §4.
The two that bite:

- ⚠ **The scratch brain does not survive the ssh that starts it.** logind
  reports `KillUserProcesses=true` at runtime while `logind.conf` shows it
  commented out, and `Linger=no` for `jasons`, so systemd tears down the user
  slice when the session closes — `setsid`/`nohup`/`disown` cannot help. Start
  it and keep that ssh alive for your whole session. `loginctl enable-linger
  jasons` would fix it properly; it is a system settings change and is Jason's
  to run.
- ⚠ **Check WHICH worktree the dev server on `:3100` serves.** Every
  worktree's looks identical and the CORS allowlist is only 3000/3001/3100, so
  another port is not an escape:

  ```sh
  lsof -a -p "$(lsof -tiTCP:3100 -sTCP:LISTEN | head -1)" -d cwd -Fn
  ```

Suite baseline: **86 pass / 66 skip / 2 fail**. Both failures are
`team.spec.ts` (pre-existing, missing provisioning). `field-primitives.spec.ts`
is a known flake, roughly 1 run in 2.

---

## 6. Suggested order

1. **`/pages`** — the decision in §1 is already made; do it while the context is
   warm, and it closes the last loose end from the resizable work.
2. **`traces` + `runners`** — identical scaffolds, small, and they prove the
   `minmax()` → `minListSize`/`maxListSize` translation once for both.
3. **The four small settings screens** (`worker-groups`, `accounts`,
   `tool-groups`, `skills`) — enough §6 work to establish the pattern without
   1983 lines of it.
4. **`keys`, `peers`, `config`, `ai-workers`** — the middle.
5. **`tools`, `users`, `heartbeats`, `agents`** — the four biggest, last, once
   the form idiom is settled. `agents` alone is bigger than most of this list.
6. **`team-admin`** — two scaffolds in one file; decide one `MasterDetail` or
   two before starting.
7. **`apps/[id]`** and **`debug/context`** — deliberately last. The first is an
   editor, the second is a three-column debug view that may not want this shape
   at all.

State of the world when this was written: `main` at `9de5a2b`, pushed. Deployed
boxes run **v0.3.0**, which predates all of the resizable work — none of it is
in front of a user until the next release is tagged.
