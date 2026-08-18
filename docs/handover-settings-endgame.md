# Handover: the settings endgame (2026-08-18)

> **✅ CLOSED — the four screens below are done.** `apps/[id]`, `team-admin`,
> `settings/agents` and `settings/ai-workers` were ported in the session after
> this file was written. Phase 2b is complete; the inventory is empty.
> **What was learned doing them is in
> [`handover-settings-screens.md`](./handover-settings-screens.md) §12** — read
> that, not §2 below, which is now a record of what the work looked like
> beforehand.
>
> **The settings hub is now built too** — steps 1–3 of
> [`plan-settings-hub.md`](./plan-settings-hub.md), recorded in its §8. What is
> left of it is **step 5 only: the mantle-side nav change**, which collapses the
> thirteen Settings entries in `NAV_GROUPS` to one. That is a different repo and
> a package release, exactly as §6 of this file warns.
>
> §3 (the idiom), §4 (what §6b means), §5 (environment and the suite) and §7
> (decisions) are still current and still worth reading.

**Start here.** Fourteen screens were ported in the previous session. Four are
left, and two of them are the big ones.

Read in this order:

1. This file — state, what is left, and what the last session learned.
2. [`handover-settings-screens.md`](./handover-settings-screens.md) — the plan.
   **§10 is the trustworthy inventory; §2b is the original sweep and undercounts
   two screens badly.** §8, §9 and §11 are what was actually done.
3. [`handover-ui-consistency.md`](./handover-ui-consistency.md) §4 (environment)
   and §5 (nine landmines) before touching `packages/web-ui`.
4. [`plan-settings-hub.md`](./plan-settings-hub.md) — a separate, unstarted piece
   of work (see §6 below).

---

## 1. Where things stand

Branch `claude/handover-review-ui-settings-e20bcc`, 8 commits on top of
`b902794`, **all committed, nothing in flight**:

```
592a04d settings/tools, users and heartbeats
5b0d6e7 docs: recount every remaining screen from its directory
40109cc settings/keys, peers and config — and ai-workers is not a small screen
f89f94a settings/tool-groups + settings/skills
2a42f07 docs: plan a card-list hub
c4c27e2 settings/worker-groups + settings/accounts
deda7f9 /traces and /runners
0c9f679 /debug becomes a card list, and /pages stops declaring its width twice
```

⚠ `client/web/AGENTS.md` and `client/web/CLAUDE.md` are untracked. `next dev`
writes them on every boot; they are nobody's change. Leave them out of `git add`.

**Suite baseline: 122 pass / 103 skip / 3 fail.** See §5 for the three.

---

## 2. What is left — four screens

| screen | lines | `<Label` | `FieldHint` | raw `<select>` | raw `<textarea>` | note |
|---|---|---|---|---|---|---|
| `settings/agents` | 3662 | 34 | 65 | 9 | 1 | grid at `agents-client.tsx:958` |
| `settings/ai-workers` | 3453 | 38 | 39 | 9 | 6 | grid at `ai-workers-client.tsx:238`; **2357 of those lines are `worker-form.tsx`** |
| `team-admin` | 1082 | 0 | 0 | — | — | **TWO grids in one file** (`page.tsx:556` and `:706`) |
| `apps/[id]` | 472 | 0 | 0 | — | — | `grid-cols-[200px_minmax(0,1fr)]` at `app-detail-client.tsx:407` — no `md:` prefix, so the usual sweep misses it |

`debug/context` keeps its three-column grid. It is now INSIDE the `/debug`
detail pane, which is the right place for it — it is the tab's own content, not
a screen scaffold. Leave it.

**Order:** `apps/[id]` and `team-admin` first if you want momentum — no §6 work
at all, pure scaffold. Then the big pair. `agents` before `ai-workers`: it has
the better-understood form and the `validateTool` pattern below fits it directly.

⚠ **`team-admin` needs a decision before you start**: two `MasterDetail`s with
different `id`s, or one reused view? Nobody has decided. Two ids means two
independently remembered widths, which is probably right if the two grids show
different things.

---

## 3. The idiom — copy these, they are settled

### Scaffold

```tsx
<MasterDetail
  id="settings-<screen>"        // unique; two screens sharing one share a width
  defaultListSize="340px"       // KEEP the screen's existing width, do not normalise
  list={<>…</>}
  detail={selected ? <…/> : <div className="flex h-full items-center justify-center …">…</div>}
/>
```

- **No `detailFills` for a form** — the 672px default measure is what stops it
  running to 1200px line lengths. `config` is the one exception in this cluster
  (its detail is a diff, not form text).
- Drop `relative` / `md:h-full md:min-h-0 md:overflow-y-auto` from the panes.
  `MasterDetail` owns those now.
- ⚠ **Drop any `mx-auto max-w-*` inside the detail.** A pane that is already a
  measure AND draggable, with a second cap inside it, makes the drag do nothing.
  This was the `/pages` bug and it recurred in `accounts` (3 caps) and `peers` (2).

### Fields (§6)

```tsx
<Field data-invalid={!!errors.x || undefined}>
  <FieldLabel htmlFor="x">Label</FieldLabel>
  <Input id="x"
    aria-invalid={!!errors.x || undefined}
    aria-describedby={errors.x ? 'x-error x-hint' : 'x-hint'} />
  <FieldDescription id="x-hint">…</FieldDescription>
  <FieldError id="x-error">{errors.x}</FieldError>
</Field>
```

Keep `FieldHint` (not `FieldDescription`) only where `warn` is used — it is the
one thing that states the cost of overdoing a field, in a second tone.

For a label over a GROUP or a read-only value, use `<FieldLabel asChild><span>…`
— it keeps the type without minting a label that names nothing.

### The block transform — this is what made 3.5k-line screens tractable

38 labels is too many to hand-edit. The reliable move is a deterministic pass:
find each `<div className="space-y-1.5">` whose block contains a `<Label>`,
match its closing `</div>` **by indentation**, rewrite the pair as
`<Field>`/`</Field>` and `Label` → `FieldLabel`. 35 blocks converted this way
with no judgement calls. Then a second pass wires `data-invalid` /
`aria-invalid` / `aria-describedby` / `FieldError` per control id.

⚠ **It converts the block, not the wrapper around it.** On `heartbeats` the
list's own `flex flex-col border-b …` wrapper survived the scaffold swap and
left one unclosed `<div>`. `tsc` caught it — three edits later. **Run
`pnpm -C client/web typecheck` after every structural replacement**, not at the
end of the screen.

### Live revalidation — worth copying to `agents`

`tools` moved its rules into a pure `validateTool(form, editing)` called both on
submit and, once a submit has failed, on every change:

```tsx
const [submitted, setSubmitted] = useState(false);
useEffect(() => {
  if (!submitted || !editing) return;
  setErrors(validateTool(form, editing));
}, [submitted, form, editing]);
```

A fixed field stops complaining with no per-field `onChange` wiring. On a screen
with 34 controls that is the difference between an afternoon and a week.

### Errors in child components

Three screens needed this already, and `agents`/`ai-workers` will need more of
it: the rule lives with the parent, the message goes down as a prop.
`ToolGroupIntegrationSection` takes `serviceError`; `AssistantFields` takes
`nameError`. Same shape both times.

---

## 4. §6b is the actual job — what "validation" meant in practice

Not "add validation". **Replacing three bad deliveries**, with the rules
unchanged:

1. **Browser bubbles** — `required` / `pattern` / `type="email"` / `min` /
   `minLength`. Announced to nothing, gone on the next click, and unable to say
   WHICH rule broke. Every ported form is `noValidate`; the attributes stay as
   documentation.
2. **Toasts — 15 of them so far** (tool-groups 1, skills 2, keys 2, peers 1,
   tools 3, heartbeats 5, users 1). A message about one control, in a corner,
   that clears itself. The worst are the ones carrying a PARSER error (`skills`,
   `tools` ×3, `heartbeats` ×2): you have to read them against the JSON you just
   typed.
3. **Silence.** `keys`' rotate dialog did a bare `return` on an empty value — the
   button just looked broken.

**One toast was deliberately kept**: `heartbeats`' cron-locked refusal. It is
about the whole record, not a field, and there is nothing on screen to point at.
That distinction is the test — if the message names a control, it belongs on it.

§6d is not only `<select>`. Also raw `<textarea>` carrying hand-copied input
classes, and raw `<input type="checkbox">`. **29 selects, 11 textareas and 5
checkboxes remain app-wide**, most of them in `agents` and `ai-workers`.

---

## 5. Environment and the suite

Full detail in `handover-ui-consistency.md` §4. The two that bite are unchanged:
**the brain does not survive the ssh that starts it**, and **check which
worktree serves `:3100`**.

```sh
ssh jasons@192.168.100.75 'pkill -f "[t]sx watch server/main.ts"'
# hold this open for the whole session — it will not return:
ssh jasons@192.168.100.75 'cd /tmp/kanban-mig-verify/server/web && PORT=3999 pnpm dev'
# from YOUR worktree:
MANTLE_SERVER_ORIGIN=http://192.168.100.75:3999 PORT=3100 pnpm -C client/web dev
lsof -a -p "$(lsof -tiTCP:3100 -sTCP:LISTEN | head -1)" -d cwd -Fn   # verify the worktree
```

```sh
E2E_SERVER_URL=http://192.168.100.75:3999 E2E_CLIENT_URL=http://localhost:3100 \
E2E_EMAIL=audit@example.com E2E_PASSWORD=e2e-owner-password-1 \
E2E_SKIP_PDF=1 pnpm -C e2e e2e
```

⚠ **`pnpm lint 2>&1 | tail -N && echo OK` LIES.** The pipeline's exit status is
`tail`'s, so it always prints OK. Use `set -o pipefail` and read
`${PIPESTATUS[0]}`. This hid two unused-import errors for a whole screen.

### The three failures in the 122/103/3 baseline

- **`team.spec.ts` ×2** (both projects) — pre-existing, missing provisioning.
  Documented in `handover-ui-consistency.md` §4.
- **`field-primitives.spec.ts`** — the known flake, **but worse than §4 records.**
  It failed once IN ISOLATION this session and passed on the very next isolated
  run with identical code; §4 claims isolation always passes. It measures
  `/tasks`, which the whole batch never touched. Not a regression — but
  "it passes in isolation" is no longer a valid way to identify it. The spec
  itself needs hardening: it should select the task by id rather than trusting
  search to have indexed it.

### ⚠ The brain has almost no data

Every one of these answers empty on the scratch brain:

```
worker-groups · tool-groups · skills · tools · email/accounts
keys · peers · heartbeats · agents · ai-workers
```

Only `users` has a row (the owner). **So every detail form reached by SELECTING
a row is unreachable there.** Two ways round it, both used already:

- Most screens have a **create mode** reachable from "New", which renders the
  same form with every required field — that is what the §6b specs drive.
- Where you need a real row, **seed it through the API in the spec** and delete
  it in a `finally` (see `settings-worker-groups.spec.ts`,
  `settings-tool-groups.spec.ts`).

⚠ `agents` and `ai-workers` are BOTH empty, and they are the two screens whose
forms are most kind-dependent (`worker-form.tsx` renders a different field set
per provider/capability). **Sort seed data before writing their specs**, or most
of the form will never render.

### e2e traps this rollout has paid for

- ⚠ **`MasterDetail` paints a CSS grid until `useMediaQuery` resolves, then swaps
  to the resizable panels** — a different tree, so the list subtree is rebuilt
  once on mount, on every ported screen. A test that touches the list before
  that swap is racing it: green in isolation, red under a full run. **Wait for
  `[data-slot="resizable-handle"]` first** — it exists only in the panel branch.
- **The one-scrollbar check is vacuous on an empty screen** (it only counts
  elements that actually overflow). `/runners` is checked structurally only for
  exactly this reason.
- **`pnpm -C e2e e2e -- -g …` silently drops the filter.** Use
  `pnpm -C e2e exec playwright test --project=split <file>`.
- **Verify every guard against the bug it exists for**: reintroduce it, watch
  only the intended test fail, restore. Every guard added this session was
  checked this way — and one of them (`debug-nav`) turned out to be testing the
  wrong thing entirely until it was.

---

## 6. The other open piece: the settings hub

[`plan-settings-hub.md`](./plan-settings-hub.md) is written and **unstarted**. It
is independent of the four screens above and can be picked up in any order.

Two constraints from it worth knowing before anyone touches settings navigation:

- ⚠ **The nav is not in this repo.** `packages/web-ui/src/layout/nav-items.ts` is
  a one-line re-export of `@crossworks/share-ui`, built in **mantle**. The hub
  and its card list are a jackdaw change; changing what the sidebar lists is a
  mantle release.
- ⚠ **A `settings/layout.tsx` would wrap the WHOLE cluster**, putting the hub
  rail beside `/settings/agents` — a list inside a list. The plan uses a `(hub)`
  route group instead, which changes the file tree and not the paths.

The plan also inventories **nine remaining `mx-auto max-w-*` caps** across the
singleton settings screens — the same double-measure bug described in §3.

---

## 7. Decisions already made — do not relitigate

- **`/pages`**: the workspace width toggle is gone; the EDITOR at `/pages/[id]`
  keeps its own. `data.width` lives on, written from one place.
- **`traces` / `runners`**: `minmax(340px,400px)` became `340 / 400 / 560` — the
  floor and landing position kept, the ceiling deliberately not, because a 60px
  drag range is not a divider. It is the one judgement call in that port.
- **`ai-workers` moves to the last batch** with `agents` (Jason, 2026-08-18).
- **The settings hub keeps the name "Settings"** at the unclaimed `/settings`
  route — recommended, not yet confirmed.
- **`team-admin` gets TWO `MasterDetail` ids**, not one reused view — the §2
  question, answered while porting it. Reasoning in
  [`handover-settings-screens.md`](./handover-settings-screens.md) §12.

---

## 8. What changed after this file was written (2026-08-18, later)

The four screens are ported and the suite is **135 pass / 115 skip / 2 fail**
(the two are `team.spec.ts`, pre-existing). Corrections to what is above:

- §2's order held, and `agents` did take the `validateTool` pattern directly.
  But **its API key and Model fields are on the "Model & routing" tab**, not
  General — the field→tab map has to be read off `data-agent-section`, not
  guessed.
- §4's "§6d is not only `<select>`" understated one thing: on an UNCONTROLLED
  form (`ai-workers`), **a Radix `Select` submits nothing at all**. It needs a
  hidden input under the same name. Radix `Checkbox` does not — it brings its
  own.
- §5's `PIPESTATUS[0]` advice is **bash**. This shell is zsh:
  `${pipestatus[1]}`, 1-indexed. The bash form prints nothing and reads as a
  pass.
- §5's "seed it through the API in the spec" was needed once more: the
  system-prompt rule is unreachable on the scratch brain without a saved API
  key, so `settings-agents-workers.spec.ts` mints one and deletes it in a
  `finally`.
