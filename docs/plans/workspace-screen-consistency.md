# Plan: bring the workspace screens up to the Tasks standard

`/tasks` is the reference implementation. This is the plan for the other
screens. It is ordered by what a user notices, not by what is easiest.

The rules themselves live in [`ui-style-guide.md`](../ui-style-guide.md) —
§4a (our relationship to shadcn), §5 (buttons), §6 (forms), §8 (layout,
detail-header anatomy, resizable panes). This document only says **where** the
work is and **in what order**.

## What "done" means for a screen

A screen is finished when all six hold:

1. Forms compose `FieldGroup` / `Field` / `FieldLabel` / `FieldDescription` /
   `FieldError`, not `div` + `space-y-*` (§6a).
2. Validation is the `data-invalid` / `aria-invalid` / `role="alert"` triple,
   not a loose red `<p>` (§6b).
3. The composer is a boxed, width-capped, left-aligned card (§6c).
4. No raw `<input>` / `<textarea>`; every scroll area is `scrollbar-thin` (§6d, §8).
5. The detail header follows the Pages anatomy: icon in the `h2`, title
   truncates, actions `shrink-0`, one delete idiom, delete last (§8).
6. Buttons use a real size, never `className="size-7"`; icon-only buttons use
   the `icon-*` twin that matches their row (§5).

## Phase 1 — finish the shared foundation ✅ DONE

These are one-file changes that improve every screen at once, so they are worth
doing before touching any individual screen.

| Item | Where | Why now |
|---|---|---|
| ✅ `Input` is missing `text-base md:text-sm` | `packages/web-ui/src/ui/input.tsx` | 16px on small screens is what stops iOS zooming on focus. `Textarea` has it; `Input` does not. |
| ✅ Extract `CommentThread` | `packages/web-ui/src/comment-thread.tsx` | `tasks/task-comments.tsx` and `team-workspace/team-task-comments.tsx` duplicated the role chip, post row, empty state and composer. The Tasks one had the composer on top and newest-first; the member one did not. They will keep drifting. |
| ✅ Retire the second delete idiom | repo-wide | 12 uses of always-red vs 11 of red-on-hover. §8 picks one; the other should stop spreading. |

**How they landed:**

- `Input` now carries `text-base md:text-sm`. `className` still wins (the kit
  merges through `tailwind-merge`), so a screen that deliberately wants `text-sm`
  everywhere can still say so.
- `<CommentThread>` is presentation only — comments in, `onSend`/`onDelete` out.
  Neither transport moved into it: the owner surface keeps its `apiFetch` + SSE
  subscription, the member surface keeps `teamFetch` + a 30s poll. `onDelete` is
  **omitted** on the member surface rather than disabled, so members have no
  moderation button at all. Both surfaces now run the reference behaviour
  (composer on top, newest first); the member thread keeps its `max-w-2xl`
  measure via `className`, because it has to line up with `TaskPresenter` above
  it — that is alignment, not the centring §6c retired.
- 14 always-red delete buttons across 13 files became grey-until-hover. Two
  non-delete, text-only buttons were left as they were on purpose — see §8,
  which now records why, so nobody "finishes" the sweep.

Two things phase 2 still owns, and phase 1 deliberately did not touch: the
`Trash2 + "Delete"` text labels on the settings editors (§8 wants no label), and
their position in the header row.

**Both changed primitives are now pinned in `e2e/`,** because a shared primitive
that regresses regresses everywhere:

- `specs/field-primitives.spec.ts` measures the computed font size of `Input`
  and `Textarea` at 375px and 1280px. A grep for `text-base md:text-sm` would
  pass on a screen that overrides it; the measurement is what iOS reacts to.
- `specs/tasks.spec.ts` drives the comment thread end to end — post, ordering,
  composer placement, delete-with-confirm. It is the only browser coverage
  either copy of `<CommentThread>` has.

Both were verified against the bug they exist for (revert the change, watch the
test fail) before being committed. Do the same for the phase-4 guards.

⚠ **The member thread has not been exercised in a browser.** `team.spec.ts`
cannot run on the scratch brain (no provisioning), so `TeamTaskComments` is
covered only by the typechecker and by sharing its component with the owner
path. Check /team against a brain with real data.

## Phase 2 — the master-detail screens (24 of them)

All 24 use the hand-written grid at one of **three** different widths
(`300px` ×1, `340px` ×16, `360px` ×9 — drift in itself). Porting each to
`<MasterDetail>` fixes the width, the resize, the persistence and the §8 pane
rules in one edit.

Ordered by traffic:

**2a. Daily drivers** — ✅ `events`, ✅ `contacts`, ✅ `journal`, ✅ `secrets`,
✅ `models`, ✅ `runs`, ✅ `sandboxes`, ✅ `formulas`, ✅ `apps`

**Phase 2a is done — 9 of 9.**

`events` went first, as the closest structural match to `tasks`, to prove the
pattern travels. It did.

**What the nine ports taught us — read before picking up a 2b screen:**

- **The pattern travels, and the port is mostly mechanical.** Scaffold →
  `<MasterDetail id="<screen>">`, form → `Field` family, raw `<select>`/
  `<textarea>` → the kit's, header → §8 anatomy. Both screens took one pass.
- **Drop `mx-auto max-w-*` from the detail**, don't keep it. The divider is the
  measure now; a `max-w-2xl` inside a draggable pane means dragging it wider
  does nothing, and a centred composer walks away from the list it belongs to.
  Where a screen ALSO has a deep-link route (`/events/[id]`), give the shared
  component a `className` and let the route pass the measure — the pane passes
  nothing.
- **Two screens had the cold-load selection race** (`/tasks`, `/events`): the
  default-selection effect read an empty local list and opened a composer that
  was never revisited. Both fixed. The remaining screens derive selection
  (`?id ?? rows[0]`) instead, which cannot go wrong the same way — check which
  kind you have before assuming.
- **`Field` stretches its direct children.** See §6a's warning; it caught the
  "+ Add email" button on contacts.
- **§6b is the part with real bite.** Every form so far had one shared red
  message at the foot. Anchoring it per control is where the actual work is,
  and where the tests earn their keep — events has four failure modes and the
  spec walks the marker moving between fields.
- **`DateTimePicker` forwards `aria-invalid` now**, so a date field can fail
  visibly. It could not before.
- **A detail pane must not bring its own scroller.** `MasterDetail` owns one; a
  preview that keeps `h-full min-h-0 overflow-y-auto` nests a second inside it,
  which paints two bars and sticks a `sticky` header to the wrong one. Journal
  did. Delete the inner scroller and let content flow — `journal.spec.ts` counts
  the bars.
- **Look for raw `fetch('/api/…')` while you are in the file.** Journal's editor
  had the last one in the client, and on the detached topology it was broken
  outright: the CLIENT origin has no `/api` routes, so every save redirected to
  `/login`. `apiFetch`/`apiSend` are the only way to the brain.
- **Watch for a domain type called `Field`.** Secrets has one (a label/value
  pair), so there the UI primitive is imported as `Field as FormField` — alias
  the primitive, not the wire type.
- **A `<Label>` with no control is worse than no label.** Secrets' revealed note
  had one; it is a caption (`<p className="text-sm font-medium">`) now. §6a is
  about form controls, not read-only output.
- **A screen with its own form helper has usually skipped `htmlFor` entirely.**
  Formulas had a local `Field` — same name as the primitive, and a bare
  `<Label>` beside arbitrary children, so ~40 labels named no control at all.
  A wrapper cannot mint an id for a child it does not know, which is exactly
  why the shape drifts. The fix is a **render prop**: the wrapper makes the id
  and hands it down (`{(f) => <Input {...f} … />}`), so the association cannot
  be forgotten one field at a time. Look for this in 2b — the settings editors
  are the other place a screen rolled its own field.
- **Reverting the label fixes a form's density, so re-check it in a browser.**
  The primitive's label is `text-sm` where a hand-rolled one is usually
  `text-xs`, and `FieldGroup` is `gap-4` where hand-spacing is `space-y-3`.
  A dense editor visibly loosens. That is the standard, not a regression —
  but look at it before assuming.
- **A whole-form outcome is not a field error.** A failed evaluation, or a
  server's rejection of a whole spec, stays a panel; it just needs
  `role="alert"` so it is announced. `FieldError` is for the control at fault.
  Keep the two apart or §6b's per-control anchoring stops meaning anything.
- **Check what a summary line says while another view is broken.** The
  editor's header read "0 problem(s) to fix." beside a red YAML box, because
  its findings are computed from the last draft that parsed. Any screen with
  two views over one model can say this.
- **A pane whose content is not prose does not want the 672px measure.** Apps
  embeds an app viewport; capping it would shrink the only thing the screen is
  for. `detailFills` exists for that, and phase 3's `pages`/`draw` previews are
  the same shape.
- **Assert "still mounted", not "zero width".** A collapse and an unmount look
  identical in a screenshot and differ entirely in what the user loses. The
  test types into the search box, toggles focus, and reads the value back —
  `count()` and `inputValue()`, deliberately not `toBeVisible()`, since a
  zero-width element is correctly invisible.
- **Leaving focus mode is not one frame.** The shell's chrome comes back and
  the panel group narrows a moment after the list reappears, so a width sampled
  in between is legitimately wrong. Poll on the delta from the width it left
  at, never on a bare threshold.

Each ported screen gets a spec (`e2e/specs/<screen>.spec.ts`). Keep them about
the PORT — the scaffold, the header, the validation — not the domain; the domain
already has its own coverage or does not need any.

**`apps` was blocked on a `MasterDetail` decision. Resolved: opt-in prop.**
`MasterDetail` now takes `listCollapsed`, which drives the list column to zero
width *without unmounting it*, so the search box, scroll position and page
survive a focus-mode round trip. `/apps` passes its `zen` state; nothing else
passes it, so the other eight screens behave exactly as before.

Two things that decision turned on, both worth keeping in mind for `pages` and
`draw` in phase 3:

- **Opt-in, not automatic.** Making `MasterDetail` read zen itself would have
  been less wiring and would have changed eight screens' behaviour in one
  commit, on a mode only ever looked at on `apps`. It can still be done later
  by passing `zen` from each screen.
- **`collapsible` is not free.** The panel library's `collapsible` also means
  "collapse when dragged below `minSize`". Setting it unconditionally would let
  every ported list be dragged out of existence, so the prop having no default
  is load-bearing: passing `listCollapsed` at all is what opts a screen in.
  `master-detail-screens.spec.ts` holds that line.

**Shape of what is left in 2a** (checked, so the next session can pick by size):

| screen | scaffold | notable |
|---|---|---|
| ✅ `models` | was `[360px_1fr]` | pure scaffold swap; keeps 360px via `defaultListSize` |
| ✅ `runs` | was `[360px_1fr]` | pure swap; the worker strip above the panes means MasterDetail takes `min-h-0 flex-1`, not the page |
| ✅ `sandboxes` | was `[340px_1fr]` | pure swap. Its `<Label>` was labelling a checkbox — correct, left alone |
| ✅ `formulas` | was `md:grid-cols-[360px_1fr]` | keeps 360px. The editor stays a WHOLE-PANE surface, not a detail-pane composer — see below |
| ✅ `apps` | was `focusGridClass` | `listCollapsed` for focus mode, `detailFills` so the app viewport is not capped at a reading measure |

**`formulas` kept its editor outside the panes, on purpose.** `FormulaEditor`
replaces the entire screen rather than rendering into the detail column, and
the port did not change that: it carries a validation rail in its own
`lg:grid-cols-[1fr_320px]`, and a two-column form inside a 672px detail panel
is unusable. So §6c's boxed-composer rule does not apply to it — it is a
full-pane surface and takes the §8 detail-header anatomy instead. The cost is
that opening the editor unmounts `MasterDetail`, so the list's scroll position
and page are lost on return; that is pre-existing, and it is the same
collapsed-but-mounted capability `apps` is blocked on. If `MasterDetail` learns
it, formulas can use it too.

`models`, `runs` and `sandboxes` were **scaffold-only** ports: no form, no
validation, nothing user-visible beyond the divider. Rather than three
near-identical spec files they share `e2e/specs/master-detail-screens.spec.ts`,
a table-driven spec that asserts the panes exist, the width persists under a
per-screen key, and the pane owns at most one scrollbar. Adding a row is the
whole cost of covering the next port — `formulas` took one, and `apps` will
too. Keep the per-screen specs for ports that change behaviour: `formulas`
also has `e2e/specs/formulas.spec.ts`, because it changed three.

⚠ **`/sandboxes` is not verified in a browser.** The `sandboxes` compose profile
is off on the scratch brain, so the screen renders its "not enabled" explainer and
the spec row skips itself (out loud — a silent skip reads like a pass). The port
is typechecked and structurally identical to `runs`; confirm it on a box with the
profile on.

**2b. Settings** — `accounts`, `agents`, `ai-workers`, `heartbeats`, `keys`,
`peers`, `skills`, `tools`, `tool-groups`, `users`, `worker-groups`, `config`

Lower traffic, but the largest cluster and the most forms. These carry most of
the app's `FieldHint` usage, so they benefit most from §6a/§6b. They are also
the screens I could not verify on the scratch brain (no agents, no workers, no
heartbeats provisioned) — check them against a brain with real data.

**2c. Remaining** — `team-admin`, `team-workspace/team-section`. (`docs/layout.tsx`
is done, along with `files`, `tables`, `notes`, `draw` and `pages` — see
[`handover-resizable-columns.md`](../handover-resizable-columns.md), which is
closed out.)

## Phase 3 — the surfaces that are not master-detail

| Screen | Work |
|---|---|
| Assistant dock | `assistant-client.tsx:1863` is a raw `<textarea>` — the last fat scrollbar in the app, and no focus ring. |
| Mail | Already uses `ResizablePanelGroup`, but persists layout to a **cookie** via `onLayoutChanged` rather than `useDefaultLayout`. Converge on one mechanism. |
| Pages / Draw / Tables | Their own EDITORS, only. The three list screens are now `MasterDetail` (`detailFills` + `listCollapsed`); the editor bodies were deliberately left alone. Audit those against §6d and §8, and do not force the master-detail shape onto them. |

## Phase 4 — stop the drift coming back

Rules that are written down still get broken; this session found several that
had been in the guide for months.

- **Lint rule: ban raw `<textarea>` / `<input>`** outside `packages/web-ui`.
  The repo already has custom rules (`mantle/use-ink-for-text`), so the
  mechanism exists. This is the single highest-value guard — a hand-rolled
  field silently loses the focus ring, the invalid state and the thin
  scrollbar.
- **Test: every scroll container carries `scrollbar-thin`.** 54 currently do
  not. Grep is not enough; assert on computed `scrollbarWidth` in a browser
  test, because an element can inherit an overflow and still miss the class.
- **Lint rule: no `size-[0-9]+` on a `<Button>`.** The `icon-*` twins exist now;
  5 hand-sized buttons remain.

## Sequencing note

Phase 1 changes shared primitives, so land it before Phase 2 fans out across 24
files. Phases 2a/2b/2c are independent of each other and can be done in any
order, or in parallel across worktrees.

Do not start Phase 4's lint rules until Phase 2 is well advanced — a rule that
fails on 24 screens is a rule someone will disable.
