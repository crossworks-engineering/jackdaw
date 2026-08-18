# Handover: the last screens without a real resizable column (2026-08-18)

## ✅ DONE — all six are ported, phase 2 of the rollout is complete

Six screens had a list column that a user could not drag properly. Docs and
Files went first (Group A); Tables, Notes, Draw and Pages followed in that
order and landed the same day. **`components/layout/focus-layout.ts` and its
test are deleted** — Pages and Draw were its only importers, and that deletion
was the agreed completion signal for this document.

Nothing here is a to-do any more. What is left is the record: which screen took
which props, and the handful of things the ports taught. Read
[`ui-style-guide.md`](./ui-style-guide.md) §8 for the pattern itself —
specifically "Master-detail: the anatomy, and the rules that outlive the
scaffold".

---

## 1. What "done" looks like

Per §8, and in the order a user notices:

1. **A real drag handle** — `<ResizableHandle withHandle>`, which `MasterDetail`
   renders for you. Visible grip, keyboard-operable, `aria-orientation` set.
2. **The width persists**, per screen, under `MasterDetail`'s `id`.
3. **The content pane hugs the divider — tucked LEFT, never centred.** A
   `mx-auto max-w-*` in the detail is wrong twice: it walks content away from
   the list, and it makes dragging the divider do nothing.
4. **The detail pane owns exactly one scrollbar** (landmine 9).
5. **Focus mode collapses the list without unmounting it** — `listCollapsed`.

---

## 2. The screens, and what each one ended up with

All six are `<MasterDetail>` now. What each one ended up passing, and why:

| screen | file | props | why |
|---|---|---|---|
| ~~**Files**~~ | `files/files-client.tsx` | `defaultListSize="260px"`, `detailFills` | a six-column file table, not prose |
| ~~**Docs**~~ | `docs/layout.tsx` | `defaultListSize="300px"` | documentation prose — the only screen that takes the 672px default |
| ~~**Tables**~~ | `tables/tables-shell.tsx` | `320px` (220–520), `detailFills`, `listCollapsed` | a data grid; `listCollapsed` drives the screen's own collapse toggle |
| ~~**Notes**~~ | `notes/notes-client.tsx` | `380px` (300–760), `detailFills`, `listCollapsed` | a full-bleed markdown editor; focus mode is labelled "full width" |
| ~~**Draw**~~ | `draw/draws-client.tsx` | `360px`, `detailFills`, `listCollapsed` | an SVG snapshot / pan-zoom canvas |
| ~~**Pages**~~ | `pages/pages-client.tsx` | `300px` (220–560), `detailFills`, `listCollapsed` | the preview declares its OWN measure (per-page narrow/wide) and an xl outline rail |

**Every one of the four late ports took `detailFills`, and that is not an
accident.** Two rules pushed the same way:

- All four had `1fr` on the right. `1fr` translates to `detailFills`, never to
  the default — capping them at 672px would have been a visible regression on
  screens where the port was supposed to change nothing but the divider.
- **A screen with focus mode needs `detailFills` for focus mode to mean
  anything.** Under the three-panel default, collapsing the list hands the
  freed width to the empty SPACER, not to the detail; the chrome disappears and
  the content stays the width it was. Only `/docs` — no focus mode, plain prose,
  no measure of its own — takes the default.

### ✅ Apps is already done — do not port it again

`/apps` was ported on 2026-08-18 (`84d3097`) and shipped in **v0.3.0**, which is
what both dev and jason-prod are running. It uses `MasterDetail` with
`detailFills` and `listCollapsed`.

It was on the original list for this handover. If you see no drag handle on
`/apps`, **hard-refresh before believing it** — the most likely cause is a
cached bundle from before the roll. Verify against the code, not memory:

```bash
git show v0.3.0:'client/web/app/(app)/apps/apps-client.tsx' | grep -n MasterDetail
```

One real wrinkle worth checking while you are there: because `/apps` passes
`listCollapsed`, its list panel **is** `collapsible`, so dragging left past
`minListSize` collapses it to zero. The handle stays, so it is recoverable —
but confirm that reads as deliberate rather than as the list vanishing.

---

## 3. The three groups, and what each taught

### ✅ Group A — fixed grid, no resize (Files, Docs) — both done

Both left columns stayed trees rather than `<ListCard>` lists — the deliberate
exception this section always recorded. Three things came out of doing them,
and all three bit the four ports that followed:

- **`1fr` translates to `detailFills`, not to the default.** `/files` was
  `grid-cols-[260px_1fr]`; the three-panel default would have capped its
  six-column file table at 672px and parked a spacer beside it. `/docs` is the
  opposite case — prose — so it takes the default and its 672px measure. Ask
  what the detail pane IS before picking.
- **A detail pane with its own pinned header keeps its own scroller.** `/files`
  has a breadcrumb header and a toolbar above a `flex-1 overflow-y-auto` grid;
  handing the scroll to `MasterDetail`'s pane would scroll them away. `h-full`
  + `overflow-hidden` on the pane's root means the outer scroller can never
  overflow, so only one bar is ever painted and the coverage row still passes.
  Landmine 9 is "don't paint two bars", not "never nest a scroller".
- **Drop `border-r` from a left column when it moves in.** The handle IS a 1px
  `bg-border` rule in that exact place. Add `h-full` at the same time: a grid
  item stretched to its row, a flex item does not, so a tinted rail stops
  wherever its content ends.

### ✅ Group B — hand-rolled resizers (Tables, Notes, Pages) — all done

All three had the same 2px `aria-hidden` strip on the divider — no grip, no
keyboard path, and a `hover:bg-primary/20` that was the only hint it existed —
plus three separate width stores (`tables.listWidth`,
`mantle:notes-list-width`, `mantle:pages-list-width`) and three copies of the
pointer maths. `MasterDetail`'s `id` + `useDefaultLayout` replaced all of it.

Each screen's old clamps were carried over verbatim rather than normalised, so
the column lands and stops where its users are used to.

**⚠ Saved widths reset once, deliberately — no migration.** Decided on Tables
and applied to all four. The reasons, so nobody re-opens it:

- `useDefaultLayout` persists a **percentage array keyed by panel id**, not a
  pixel number. A migration would have to convert px → % against a container
  width that does not exist until after first layout, writing an unversioned
  private shape that a library bump can change under it.
- The old clamps disagree with the new ones (220–520 / 300–760 / 220–560 vs
  `MasterDetail`'s 260–560 default band), so a migrated width can land out of
  range anyway.
- Migration code here is write-once, read-never: it has to live forever to
  catch a returning user, and it can only be tested against itself.

Each screen lands on a sane default, and one drag fixes it permanently.

### ✅ Group C — focus mode (Draw, Notes, Pages) — all done

| was | now |
|---|---|
| `focusGridClass(zen)` (Draw) | `listCollapsed={zen}` |
| `focusGridColumns(zen, listWidth)` (Pages) | `listCollapsed={zen}` |
| `focus ? '0px minmax(0, 1fr)' : …` (Notes) | `listCollapsed={focus}` |

Like-for-like: all three already collapsed to zero while keeping the list
mounted, which is exactly `listCollapsed`'s contract.

**`components/layout/focus-layout.ts` and `focus-layout.test.ts` are deleted.**
Pages and Draw were the last importers. `components/layout/zen-mode.ts` named
the file in a doc comment (not an import, so nothing would have warned); it now
points at `listCollapsed` instead.

Two things the focus ports taught:

- **Focus mode without `detailFills` is nearly a no-op.** The list collapses,
  the shell's chrome goes, and the freed width lands in the empty SPACER
  panel — the content stays exactly as wide as it was. If a screen has focus
  mode, it wants `detailFills`.
- **Notes' focus mode is LOCAL state, not the shell's `zen`.** It lives in the
  note editor's header and does not touch `ZenModeContext`, so the shell keeps
  its chrome. Draw and Pages use the shared `<FocusToggle>` and the shell's
  `zen`. Same prop, different source — don't assume `useZenMode()` on Notes.

### The port pattern, in the order it goes wrong

1. Lift the list's children into `list={<>…</>}` and DROP the wrapper: its
   `border-r` (the handle IS that 1px rule), its inline width, and the DIY
   handle. `MasterDetail` supplies `flex h-full min-h-0 flex-col
   overflow-hidden` around whatever you pass.
2. Decide the detail wrapper. **A pane with its own pinned header keeps its own
   scroller** — Tables (sticky toolbar over a grid) and Notes (sticky header
   over a body) do, and take `h-full overflow-hidden` on the pane's root so
   `MasterDetail`'s scroller can never overflow and only one bar is painted.
   Draw and Pages have no pinned header, so their previews go in unwrapped.
   Landmine 9 is "don't paint two bars", not "never nest a scroller".
3. Gate that wrapper at `md:` if the screen used to (`md:h-full
   md:overflow-hidden`). Below `md` the panes stack and `<main>` scrolls; an
   unconditional `h-full` there is at best a no-op and at worst a trap.
4. The old left column's closing `</div>` is easy to leave behind. It typechecks
   as a JSX error two hundred lines later, not where you made it.

---

## 4. The primitive — the whole prop surface, and the one rule about it

Everything these screens needed already existed, and is covered by tests:

| need | prop |
|---|---|
| a different column width | `defaultListSize` / `minListSize` / `maxListSize` |
| focus mode | `listCollapsed` (mounted, not unmounted) |
| an editor/preview that should take the slack | `detailFills` |
| a left pane that wants every pixel | `listFills` |
| detail on the left | `detailFirst` |

⚠ **`listCollapsed` has no default, and that is load-bearing.** Passing it at
all is what makes the panel `collapsible` — which also means "collapse when
dragged below `minSize`". Setting it for a screen that does not need focus mode
lets that list be dragged out of existence. `master-detail-screens.spec.ts`
holds this line; do not "tidy" it into a default.

---

## 5. Scope note — what these ports deliberately did NOT touch

`plans/workspace-screen-consistency.md` phase 3 says of Pages / Draw / Tables:
*"Audit against §6d and §8 only; do not force the master-detail shape onto
them."* That still stands **for their editors**. This work was narrower: the
**list column and its divider**, not the editor bodies, and not a §6 form sweep.

Two things were left alone on purpose, and are the obvious next questions:

- **Pages' preview still declares its own measure.** `mx-auto max-w-3xl` /
  `max-w-none`, driven by the per-page `width` setting that is persisted
  server-side, plus an `xl:` outline rail. §8 says a `mx-auto max-w-*` in a
  detail pane is wrong and that the measure is the panel's job. Reconciling
  those two means retiring a shipped, user-facing control — a product decision,
  not a port. `detailFills` was chosen so the existing control keeps working.
- **Notes' preview prose runs the full pane width** (`prose max-w-none`), as it
  did before. `detailFills` preserved that rather than introducing a measure
  the screen never had.

---

## 6. Coverage

**A scaffold-only port is ONE ROW** in `e2e/specs/master-detail-screens.spec.ts`
— panes exist, width persists under a per-screen key, the detail pane owns at
most one scrollbar. That was the whole cost for Files, Docs and Tables; Notes,
Draw and Pages take a row there too, plus one in `focus-mode.spec.ts`.

The table also asserts the screen **server-renders** without falling back to
client rendering. `MasterDetail` handed `useDefaultLayout` an explicit
`storage: undefined` on the server, which trips that hook's
`storage = localStorage` default — not a Node global — and threw out of its
server snapshot. Nine screens never saw it because they all read
`useSearchParams` with no Suspense boundary, which de-opts the subtree anyway;
`/docs` is a layout that genuinely SSRs and found it on the first load. Fixed in
`master-detail.tsx`, but the guard is worth knowing about before you decide a
new red row is your port's fault.

⚠ **The one-scrollbar check is vacuous on an empty screen** — it only counts
elements where `scrollHeight > clientHeight`. Put enough rows in front of it to
overflow before you believe it. On `/files` it counted 0 with one file in the
folder and 1 (the right one) with thirty.

Write a per-screen spec only where the port **changes behaviour**. Here that
meant the focus-mode screens, and they share one file: `focus-mode.spec.ts`
asserts the list is **collapsed but still mounted**.

⚠ **`inputValue()` is NOT the guard on Notes / Draw / Pages, unlike
`apps.spec.ts`.** On all three the search box is a controlled input whose state
lives in the SCREEN component, not inside the list subtree — so React
re-renders it with the same text after a real unmount, and an `inputValue`
assertion passes with `list={zen ? null : …}` deliberately put back. `count()`
is what separates the two. Still deliberately **not** `toBeVisible()`: a
zero-width element is correctly invisible, and that is the distinction the test
exists to draw. The file adds one more assertion worth keeping: **no divider
survives a collapse**, or a handle sits at the screen edge dragging a column
the user just asked to be rid of.

**Verify every guard against the bug it exists for** before committing: revert
the fix, watch the test fail, restore it. Landmine 6 in
[`handover-ui-consistency.md`](./handover-ui-consistency.md) §5 is the whole
argument — a guard that asserted nothing passed with the bug deliberately
reintroduced.

---

## 7. Traps that cost time

- **Leaving focus mode is not one frame.** The shell's chrome returns and the
  panel group narrows a moment after the list reappears, so a width sampled in
  between is legitimately wider. Poll on the delta from the width it left at,
  never a bare threshold.
- **Check which worktree the dev server on `:3100` is serving.** Every
  worktree's server looks identical, and the brain's CORS allowlist is only
  3000/3001/3100 so you cannot sidestep it with another port:

  ```sh
  lsof -a -p "$(lsof -tiTCP:3100 -sTCP:LISTEN | head -1)" -d cwd -Fn
  ```

- **A one-line revert does not always reintroduce the bug you are testing.**
  On `/tables`, removing `overflow-hidden` from the detail root still gave ONE
  scrollbar: the `h-full` chain means the pane and the grid cannot both
  overflow. The row is live there (it counts 1 with 80 rows in the grid, 0 with
  3), but that particular guard could not be falsified by editing that screen.
  Falsify the assertion you can — pointing `/tables`' `id` at another screen's
  key does fail "no saved layout under a key naming tables".
- **`pnpm -C e2e e2e -- -g …` silently ignores the filter** and runs the whole
  suite. Use `pnpm -C e2e exec playwright test --project=split <file>` when you
  want one spec.

Full environment, credentials and the nine landmines:
[`handover-ui-consistency.md`](./handover-ui-consistency.md) §4–5.

---

## 8. ✅ Make every draggable edge visibly draggable — done

Jason's ask, separate from the ports above: **wherever a column can be dragged,
the grip must be visible at rest** — including the nav and activity rails while
they are expanded. `RailHandle` used to render `after:bg-transparent` and no
grip element at all, so the two rails a user meets on every screen read as
fixed furniture until the pointer crossed an 8px strip.

`packages/web-ui/src/ui/rail-handle.tsx` now draws the **same chip**
`ResizableHandle withHandle` does — `h-4 w-3`, bordered, `bg-border`, a
`size-2.5` `GripVerticalIcon` — at rest. Only the positioning differs: the chip
is centred on the handle's 1px rule so it straddles the rail's edge, the way
`ResizableHandle`'s straddles its divider. Nothing else changed; the `role`,
`aria-valuenow/min/max`, `tabIndex`, arrow-key nudging, Home/End and
double-click escape hatch were already there.

Two things settled while doing it, worth not re-litigating:

- **The `after:` rule stays transparent at rest.** `ResizableHandle`'s 1px
  `bg-border` line exists because a panel divider has no border of its own; a
  rail already has `border-r`/`border-l` in exactly that place, so painting the
  rule too would double the border rather than strengthen the affordance.
- **The rails' scrollbars are overlay** (0px of layout width on macOS), so the
  chip's inboard half displaces nothing. It paints over the last ~6px of the
  scroll area, which is only visible while actively scrolling.

Covered by `shell-layout.spec.ts` → *"both shell rails show a drag grip at rest,
the same one every divider shows"*. It measures the grip's painted box against
the **divider's** chip with the pointer parked away, so the two cannot drift
apart, and reads computed `opacity`/`background-color` so a hover-gated grip
fails too. Both regressions were verified by reintroducing them.

The hand-rolled resizers in Notes / Pages / Tables got the grip for free when
they moved to `MasterDetail`, exactly as this section predicted — they were
never patched separately.

---

## 9. ✅ The order it was done in, and what is left

1. ~~**Docs**~~ · 2. ~~**Files**~~ · 3. ~~**Tables**~~ · 4. ~~**Notes**~~ ·
5. ~~**Draw**~~ · 6. ~~**Pages**~~ — and §8 (`RailHandle`'s grip), which was
independent of all six.

`components/layout/focus-layout.ts` is gone. **That was the completion signal
for this document, so this document is finished.**

What this did NOT do, for the next reader:

- **The 12 settings screens plus `team-admin` / `team-section`** still use the
  legacy hand-written grid (§8 documents it for exactly that reason). They were
  never in scope here — phase 2b owns them.
- **`/formulas` still wants `listCollapsed`** — its editor replaces the whole
  screen, so opening it unmounts `MasterDetail` and loses the list's scroll
  position. The primitive can express it; nobody has wired it.
- **Pages' own measure** (§5 above) is a product decision waiting on Jason.
