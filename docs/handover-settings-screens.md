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
- ✅ **DECIDED (2026-08-18, Jason): the editor KEEPS its toggle.** `/pages/[id]`
  is a full-page route with no divider, so removing its toggle would leave a
  long page with no width choice at all. `data.width` therefore lives on, now
  written from ONE place instead of two. The workspace copy in
  `pages-client.tsx` is gone; `page-detail-client.tsx` is untouched.
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
| `settings/ai-workers` | **3453** ⚠ | 340px | **38** ⚠ | **39** ⚠ |
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
| ~~`traces`~~ | `traces/traces-client.tsx` | ~~`md:grid-cols-[minmax(340px,400px)_1fr]`~~ | **DONE** — see §7 |
| ~~`runners`~~ | `runners/runners-client.tsx` | ~~`md:grid-cols-[minmax(340px,400px)_1fr]`~~ | **DONE** — see §7 |
| `apps/[id]` | `apps/[id]/app-detail-client.tsx` | `grid-cols-[200px_minmax(0,1fr)]` | the app EDITOR, not the list — `/apps` itself is done |
| ~~`debug/context`~~ | `debug/context/context-client.tsx` | `md:grid-cols-[1fr_1.4fr_1fr]` | **THREE columns**, INSIDE the detail pane — untouched, and fine there. The whole `/debug` section is now one `MasterDetail` (see below), so this grid is the tab's own content, not a screen scaffold |

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

1. ~~**`/pages`**~~ — **DONE.** Toggle, `applyWidth`, `onWidthChange` and the
   `mx-auto`/`max-w-3xl` wrapper removed from `pages-client.tsx`; `detailFills`
   kept and its comment rewritten. Guard: `e2e/specs/pages-reading-width.spec.ts`
   (prose fills the pane, prose is not centred, toggle absent).
2. ~~**`traces` + `runners`**~~ — **DONE.** See §7 for how the `minmax()`
   translation actually landed; it is not quite what this line assumed.
3. ~~**The four small settings screens**~~ — **DONE.** See §8.
4. **`keys`, `peers`, `config`** — **DONE**, see §9. ⚠ **`ai-workers` is NOT
   part of this batch and never should have been** — see §9's first warning.
5. **`tools`, `users`, `heartbeats`** — the middle-large three. Their planned
   sizes are ACCURATE (see §10); the form idiom from §8/§9 carries straight over.
6. **`agents` + `ai-workers`** — the big pair, last. Both are ~3.5k lines once
   their child components are counted, and both were undercounted here. See §10.
6. **`team-admin`** — two scaffolds in one file; decide one `MasterDetail` or
   two before starting.
7. **`apps/[id]`** and **`debug/context`** — deliberately last. The first is an
   editor, the second is a three-column debug view that may not want this shape
   at all.

State of the world when this was written: `main` at `9de5a2b`, pushed. Deployed
boxes run **v0.3.0**, which predates all of the resizable work — none of it is
in front of a user until the next release is tagged.


---

## 7. Done since this handover was written (2026-08-18)

### `/pages` — §1, closed
The workspace width toggle is gone; the divider is the measure and the preview
tucks left. The EDITOR keeps its toggle (§1, decided), so `data.width` lives on
and is now written from one place. Guard: `e2e/specs/pages-reading-width.spec.ts`
— both assertions verified by re-introducing `mx-auto` / `max-w-3xl` and
watching each one fail.

### `/debug` — the whole section, ported (not in the original plan)
Twelve tabs behind a horizontal strip that scrolled sideways. Now one
`MasterDetail` in `debug/layout.tsx`, with a **card per tab** in `debug-nav.tsx`:
title, a one-line description, and a stat line (`911 traces · 100% ok (24h)`,
`0/132 indexed · no duplicate edges`, …). `debug-tabs.tsx` is deleted and the
`mx-auto max-w-6xl` centring is off all thirteen pages.

Three things worth carrying forward:

- **The stat queries reuse each tab's own react-query key and URL**, so the
  cards and the tab share one cache entry rather than fetching twice. The nav
  sits in the LAYOUT, so they mount once per section, not once per navigation.
- **`sanity` and `integrity` are deliberately not fetched** for their stats —
  one runs checks on request, the other is a full corpus scan, and decorating a
  card is not a reason to make opening `/debug` do real work. Integrity borrows
  the overview bundle's cheap counters; sanity says plainly that it runs on open.
- ⚠ **A trap the next port will hit too.** `MasterDetail` paints a plain CSS
  grid until `useMediaQuery` resolves, THEN swaps to the resizable panels — a
  different tree, so the list subtree is rebuilt once on mount, on every ported
  screen. A test that touches the list before that swap is racing it: green in
  isolation, red under a full run. Wait for `[data-slot="resizable-handle"]`
  first — it exists only in the panel branch, so it is the "settled" signal.
  This cost a full debugging cycle; `debug-nav.spec.ts` records it.

### Suite
**91 pass / 71 skip / 2 fail** against the scratch brain, both projects, one
run. The two failures are `team.spec.ts` — the same pre-existing provisioning
gap §5 already names, unchanged. `field-primitives.spec.ts` flaked once in three
runs, as documented.

Still open from §2: the twelve settings screens, `traces`, `runners`,
`team-admin`, `apps/[id]`.

### `traces` + `runners` — ported together
One shape, two files. Both had a full-width filter bar above the grid, and that
stays where it is: the `MasterDetail` is the LOWER half of the screen
(`className="min-h-0 flex-1"`), not the whole of it. `detailFills` keeps the
`1fr` the detail had — a step timeline is not a measure of reading prose.

⚠ **The `minmax()` translation is not the one-liner this plan assumed.** Reading
`minmax(340px, 400px)` off as `minListSize`/`maxListSize` gives a divider with
**60px of travel** — and it also breaks the shared master-detail row, which
drags RIGHT by 100px and finds a list already sitting at its ceiling. So:

- `minListSize="340px"` — kept, it is a real floor the screen chose.
- `defaultListSize="400px"` — kept, that is where the grid lands today.
- `maxListSize="560px"` — **NOT kept at 400.** That 400 was the grid's way of
  saying "don't let this column eat the detail", which the divider now does
  better because the reader decides. Every ported screen that set a range gave
  it real travel (220–520, 300–760, 220–560); a 60px sliver is a divider you
  cannot meaningfully drag.

If the 400px ceiling was a deliberate design limit rather than a grid mechanic,
this is the line to revisit — it is the one judgement call in the port.

⚠ **`/runners` was verified structurally only.** The scratch brain has
`MANTLE_RUNS` off, so the screen renders "No runs match these filters" and its
list is EMPTY. Panes, persisted width and server render are all genuinely
checked; the one-scrollbar assertion is **vacuous there** — it only counts
elements that actually overflow. `/traces` has 871 traces behind it and does
exercise it. Re-check `/runners` against a brain with runs before trusting that
half.

Suite after this port: **93 pass / 73 skip / 2 fail** — the two are still
`team.spec.ts`.

---

## 8. The four "small" settings screens — done (2026-08-18)

`worker-groups` · `accounts` · `tool-groups` · `skills`. All four on
`MasterDetail` (each keeping its own 340/360 width, none taking `detailFills` —
the detail is a form and the 672px measure is the point), and all four onto the
`Field` family.

### What §6b actually turned out to mean here

The plan said "validation work". Concretely, it was **replacing three different
bad deliveries**:

1. **`required` / `pattern` / `min` / `max`** — the browser's own bubble.
   Announced to nothing, gone on the next click, and unable to say WHICH of a
   slug's rules broke. Every form is `noValidate` now; the attributes stay as
   documentation of the rule, and `submit()` owns the message.
2. **Toasts.** `tool-groups` announced "an integration needs a service" in a
   corner; `skills` did the same for BOTH default-state JSON failures — under a
   comment claiming they surfaced "inline". They did not. The skills one was the
   worst of the set: it carries a PARSER message you have to read against the
   text you just typed, and a toast takes it away while you are still looking at
   the textarea.
3. **Nothing at all** — fields that simply submitted and let the server 400.

The rules themselves are unchanged in all four screens. This was a port.

⚠ **Threading an error into a child component is normal here, not exotic.**
`tool-groups`' service field lives in `components/tool-group-integration.tsx`.
It takes a `serviceError?: string` prop now. Expect the same for `agents` and
`heartbeats`, which have far more child sections.

### Two things the plan's table got wrong

- ⚠ **`accounts` is not a 0-work screen.** The table records 0 `<Label>` and 0
  `FieldHint`, which is true of `accounts-client.tsx` and misses
  `imap/imap-form.tsx` entirely — 342 lines, a dozen raw labels, a password
  reveal, an SMTP block, and two raw `<input type="checkbox">`. It was the
  BIGGEST §6 job of the four, not the smallest. **Re-count the remaining rows by
  walking their child components**, not just the `*-client.tsx`.
- §6d is not only `<select>`. `accounts` had two raw checkboxes and `skills` two
  raw `<textarea>`s carrying hand-copied input classes — no focus ring, no
  invalid state, and they drift the moment a token changes.

### Also fixed in passing

`accounts` carried `max-w-md` ×2 and `max-w-2xl` inside its detail pane. A pane
that is already a measure AND draggable, with a second cap inside it, means the
drag does nothing — the `/pages` bug. Dropped. **Check every remaining screen
for this**; the singleton settings screens are full of `mx-auto max-w-2xl` (see
[`plan-settings-hub.md`](./plan-settings-hub.md) §4).

### Coverage

Four scaffold rows, plus three per-screen specs: `settings-imap-form`,
`settings-worker-groups`, `settings-tool-groups`, `settings-skills`. Each guard
verified by reintroducing the bug and watching exactly the intended test fail.

⚠ **`tool-groups`' integration section renders in EDIT mode only** — a new group
starts unbound. A first version of that spec opened "New", found no switch and
timed out. It seeds a group through the API instead.

Suite: **108 pass / 88 skip / 2 fail** — the two are still `team.spec.ts`.

Left in §2b: `keys`, `peers`, `config`, `ai-workers`, then `tools`, `users`,
`heartbeats`, `agents`, then `team-admin` and `apps/[id]`.

---

## 9. `keys` · `peers` · `config` — done (2026-08-18)

All three on `MasterDetail` at their existing widths (340 / 340 / 360).

### ⚠ FIRST: `ai-workers` is not a small screen. The table was wrong by 7×.

This batch was planned as four. It is three. Walking the child components the
way §8 said to gives:

| | plan said | actually |
|---|---|---|
| `ai-workers` | 460 lines · 0 `<Label>` · 0 `FieldHint` | **3453 lines · 38 · 39**, plus 9 raw `<select>`, 6 raw `<textarea>`, 2 raw checkboxes |

The table counted `ai-workers-client.tsx` (460 lines) and missed
**`worker-form.tsx`, which is 2357 lines on its own** — a per-kind field
renderer over every provider's chat/vision/STT/TTS/image model lists — plus five
`*-test-button.tsx` components.

For scale: **`agents` is 3662 lines.** `ai-workers` is 3453. The plan scheduled
`agents` LAST and called it "bigger than most of this list"; it scheduled
`ai-workers` here, in the middle, as a zero-work screen. **They belong in the
same batch, and it is the last one.**

### What §6b meant on these three

- **`keys` had every bad delivery at once.** Two toasts (`Paste the key value.`,
  the custom-service pattern) layered ON TOP of `required` — so a browser bubble
  and a corner message for the same field. And its rotate dialog did a **silent
  `return`** on an empty value: the button looked broken and said nothing.
- **`peers` had one toast for two controls** — "Name and base URL are required",
  naming neither of them on screen. Each field says so itself now.
- **`config` genuinely has no form.** Its 0/0 in the table is correct. Pure
  scaffold swap.

§6d: `keys`' provider `<select>` was a raw element with hand-copied input
classes; it is a `Select` now.

`config` is also **the one screen in this cluster that takes `detailFills`** —
its detail is a template-vs-live diff, not form text, and the 672px form measure
wraps it badly.

`peers` carried two `mx-auto max-w-2xl` caps inside its detail pane; dropped,
same reason as `accounts`.

### Coverage

Three scaffold rows plus `settings-keys-peers.spec.ts`. Both guards verified by
restoring the exact pre-port delivery — keys' toast and peers' single
two-control toast — and watching only the intended tests fail.

Suite: **114 pass / 94 skip / 2 fail** — the two are still `team.spec.ts`.

Remaining in §2b: **`tools`, `users`, `heartbeats`, `agents` and
`ai-workers`** (the last two are the big pair), then `team-admin` and
`apps/[id]`.

---

## 10. The corrected inventory (2026-08-18) — read this instead of §2b

§2b was counted from each screen's `*-client.tsx` alone. Two screens keep most
of their form in a CHILD component, and both were undercounted badly. Recounted
across every `.tsx` in the screen's directory:

| screen | §2b said | actual lines | `<Label` | `FieldHint` | raw `<select>` | raw `<textarea>` | raw checkbox |
|---|---|---|---|---|---|---|---|
| `tools` | 833 | 850 | 14 | 27 | 2 | 5 | 0 |
| `users` | 956 | 974 | 7 | 15 | 0 | 0 | 0 |
| `heartbeats` | 1005 | 1024 | 17 | 33 | 2 | 1 | 0 |
| **`agents`** | **1983** | **3662** ⚠ | 34 | 65 | 9 | 1 | 1 |
| **`ai-workers`** | **460** | **3453** ⚠ | 38 | 39 | 9 | 6 | 2 |

**`tools`, `users` and `heartbeats` are within 2% of the plan** — those rows are
trustworthy and the §8/§9 idiom carries straight over.

**`agents` is 85% bigger than recorded** and **`ai-workers` is 7.5× bigger.**
Both keep their field renderers in child components the original sweep never
opened (`agents/models-tab.tsx` and friends; `ai-workers/worker-form.tsx` at
2357 lines). They are a matched pair of ~3.5k-line screens and they are the
LAST batch.

**Jason's call (2026-08-18): `ai-workers` moves out of the "middle" batch and
sits with `agents` at the end.**

### The tail

| screen | lines | `<Label` | note |
|---|---|---|---|
| `team-admin` | 1082 | 0 | no form — scaffold only, but TWO grids in one file |
| `apps/[id]` | 472 | 0 | no form — the app EDITOR, `grid-cols-[200px_minmax(0,1fr)]` |

Neither carries §6 work. `team-admin`'s open question is still whether its two
scaffolds become one `MasterDetail` or two.

### The rule that produced this table

**Count the directory, not the client file.** `find <dir> -name '*.tsx'`. Three
of the five screens ported so far hid material work in a child — `accounts` in
`imap/imap-form.tsx`, `tool-groups` in `components/tool-group-integration.tsx`,
and now these two. It is the single most reliable way this plan has been wrong.
