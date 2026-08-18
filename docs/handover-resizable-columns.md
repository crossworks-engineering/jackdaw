# Handover: the last screens without a real resizable column (2026-08-18)

Six screens still have a list column that a user cannot drag properly. This is
the work to finish that, and it is now **mechanical** — every design question
`<MasterDetail>` used to raise has been answered and shipped.

Read [`ui-style-guide.md`](./ui-style-guide.md) §8 first — specifically
"Master-detail: the anatomy, and the rules that outlive the scaffold". This
file only says **where** the remaining work is and **what each screen will
fight you with**.

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

## 2. The screens, and what each one actually has today

| screen | file | lines | today | the work |
|---|---|---|---|---|
| **Files** | `files/files-client.tsx` | 1215 | `grid-cols-[260px_1fr]`, no resize at all | pure swap, `defaultListSize="260px"` |
| **Docs** | `docs/layout.tsx` | 37 | `md:grid-cols-[300px_1fr]`, no resize | pure swap, `defaultListSize="300px"` |
| **Notes** | `notes/notes-client.tsx` | 634 | hand-rolled resizer + focus mode | replace the DIY resizer |
| **Pages** | `pages/pages-client.tsx` | 1192 | hand-rolled resizer + `focusGridColumns` | replace the DIY resizer |
| **Tables** | `tables/tables-shell.tsx` | 531 | hand-rolled resizer, own storage key | replace the DIY resizer |
| **Draw** | `draw/draws-client.tsx` | 542 | `focusGridClass(zen)`, fixed 360px | swap + `listCollapsed` |

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

## 3. Three groups, easiest first

### Group A — fixed grid, no resize (Files, Docs)

The mechanical port the nine 2a screens already proved. Scaffold →
`<MasterDetail id="files"|"docs" defaultListSize="260px"|"300px">`, keep the
existing width rather than snapping to the 340px default.

`docs/layout.tsx` is 37 lines and is the single cheapest win in this list.

⚠ Neither left column is a flat list of `<ListCard>`s: Files is a **folder
tree/grid** and Docs is a **nav tree** (`docs-nav.tsx`). `MasterDetail` does not
care — it owns the boxes, not the contents — but do not "fix" them into card
lists on the way past. §8's list-card rule is about selectable list items, and
the plan already records these as deliberate exceptions.

### Group B — hand-rolled resizers (Notes, Pages, Tables)

These already resize. What they lack is a handle a user can see or reach:

```tsx
// notes-client.tsx — and pages-client.tsx has the same shape
<div
  onPointerDown={startResize}
  className="absolute inset-y-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize
             transition-colors hover:bg-primary/20 md:block"
  style={{ left: `${listWidth}px` }}
  aria-hidden
/>
```

A 2px invisible strip: no grip, `aria-hidden`, no keyboard path, and a
`hover:bg-primary/20` that is the only hint it exists. That is why the report
says "missing drag handles" on screens that technically resize.

**Each also persists its width its own way** — Notes and Pages share a
`WIDTH_KEY`/`LIST_DEFAULT` idiom, Tables invented `tables.listWidth` with its
own drag maths in `tables-shell.tsx`. Three implementations of one thing.
`MasterDetail`'s `id` + `useDefaultLayout` replaces all three.

⚠ **Saved widths will reset once.** The new key is
`master-detail:<id>`, so a user's dragged width does not carry over. Either
accept the one-time reset (fine — it lands on a sane default) or migrate the
old key on first mount. Decide deliberately; do not discover it in review.

### Group C — focus mode (Draw, and the focus half of Notes/Pages)

`MasterDetail` learned this on 2026-08-18. **Do not hand-roll it and do not
unmount the list.**

| today | replacement |
|---|---|
| `focusGridClass(zen)` (Draw) | `listCollapsed={zen}` |
| `focusGridColumns(zen, listWidth)` (Pages) | `listCollapsed={zen}` |
| `focus ? '0px minmax(0, 1fr)' : …` (Notes) | `listCollapsed={focus}` |

All three already collapse to zero **while keeping the list mounted**, which is
exactly `listCollapsed`'s contract — so this is a like-for-like swap, not a
behaviour change. `components/layout/focus-layout.ts` can be deleted once the
last caller goes; it is only Pages and Draw now.

---

## 4. The primitive is ready — no design work left

Everything these screens need already exists and is covered by tests:

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

## 5. Scope note — this narrows the plan deliberately

`plans/workspace-screen-consistency.md` phase 3 says of Pages / Draw / Tables:
*"Audit against §6d and §8 only; do not force the master-detail shape onto
them."* That still stands **for their editors**. This handover is narrower:
the **list column and its divider**, not the editor bodies, and not a §6 form
sweep. Jason asked for the resizable column specifically.

So: port the scaffold, get the handle, keep the content left. Leave each
screen's editor alone unless it breaks.

---

## 6. Coverage

**A scaffold-only port is ONE ROW** in `e2e/specs/master-detail-screens.spec.ts`
— panes exist, width persists under a per-screen key, the detail pane owns at
most one scrollbar. That is the whole cost for Files, Docs and Tables.

Write a per-screen spec only where the port **changes behaviour**. On this list
that means the focus-mode screens: assert the list is **collapsed but still
mounted**, the way `apps.spec.ts` does — type into the search box, toggle focus,
read the value back. Assert `count()` and `inputValue()`, deliberately **not**
`toBeVisible()`: a zero-width element is correctly invisible, and that is the
distinction the test exists to draw.

**Verify every guard against the bug it exists for** before committing: revert
the fix, watch the test fail, restore it. Landmine 6 in
[`handover-ui-consistency.md`](./handover-ui-consistency.md) §5 is the whole
argument — a guard that asserted nothing passed with the bug deliberately
reintroduced.

---

## 7. Two traps that cost time on the last round

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

Full environment, credentials and the nine landmines:
[`handover-ui-consistency.md`](./handover-ui-consistency.md) §4–5.

---

## 8. Make every draggable edge visibly draggable

Jason's ask, and it is separate from the ports above: **wherever a column can
be dragged, the grip must be visible at rest** — including the nav and activity
rails while they are expanded.

The two handles in the kit do not currently agree:

| | at rest | grip |
|---|---|---|
| `ResizableHandle withHandle` (`MasterDetail`) | 1px `bg-border` rule | **always drawn** — `GripVerticalIcon` in a bordered `h-4 w-3` chip |
| `RailHandle` (nav + activity rails) | `after:bg-transparent` — invisible | **none** |

So a ported screen already shows a grip, and the shell rails show nothing until
the pointer crosses an 8px strip. Same gesture, two different levels of
discoverability.

**The work is `packages/web-ui/src/ui/rail-handle.tsx`** — give it the same
affordance `ResizableHandle` has. It already has the hard parts: `role`,
`aria-valuenow/min/max`, `tabIndex`, arrow-key nudging (8px, 32px with shift),
Home/End, and a double-click escape hatch. Only the visuals are missing.

Points to settle when doing it:

- **Match `ResizableHandle` exactly**, don't invent a second grip style. The
  point is that one affordance means one thing everywhere.
- **The rails are `position: fixed`, `z-40`, pinned to the viewport edge.** The
  grip must sit ON the edge without covering rail content or the scrollbar —
  `ResizableHandle` centres its chip on a flex divider, which the rails are not.
  Check both sides: `side="left"` (nav) and `side="right"` (activity).
- **Keep "a collapsed rail has no handle"** (§8). The toggle owns that width;
  this ask is explicitly about the expanded state.
- **The hand-rolled resizers in Notes / Pages / Tables are invisible too** —
  but they get the grip for free when they move to `MasterDetail`, so don't
  patch them separately. This item is `RailHandle` only.

Verify it the way §6 says: the assertion is that the grip is **visible without
interaction**, so drive it with no hover — take the element's box and assert it
renders, rather than checking a class. Then revert and watch it fail.

---

## 9. Suggested order

1. **Docs** (37 lines) — proves the swap, costs nothing.
2. **Files** — same shape, bigger file, a tree in the left column.
3. **Tables** — first DIY-resizer removal; decide the saved-width migration here
   and apply that decision to the rest.
4. **Notes** — DIY resizer + focus mode together.
5. **Pages** — the biggest (1192 lines) and the one with both, so it goes last
   with everything else already proven.
6. **Draw** — focus mode, fixed width; could equally go earlier, it is small.

§8 (`RailHandle`'s grip) is independent of all six and touches one shared file
— do it first or last, whenever a small self-contained change suits. It is the
only item here a user sees on every screen rather than one.

After the last one, `components/layout/focus-layout.ts` and its test should be
deletable — Pages and Draw are its only importers. That is the signal the job
is finished.

One loose end when you delete it: `components/layout/zen-mode.ts` names
`focus-layout.ts` in a doc comment (not an import, so nothing breaks and
nothing warns). Update that comment to point at `MasterDetail`'s
`listCollapsed` instead, or the next reader goes looking for a file that is
no longer there.
