# Handover: the last screens without a real resizable column (2026-08-18)

Six screens had a list column that a user could not drag properly. **Docs and
Files are done** (Group A); Notes, Pages, Tables and Draw remain, and they are
the ones with hand-rolled resizers and focus mode. The work is **mechanical** —
every design question `<MasterDetail>` used to raise has been answered and
shipped.

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
| ~~**Files**~~ | `files/files-client.tsx` | 1215 | ✅ ported — `MasterDetail`, `defaultListSize="260px"` + `detailFills` | done |
| ~~**Docs**~~ | `docs/layout.tsx` | 37 | ✅ ported — `MasterDetail`, `defaultListSize="300px"` | done |
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

### ✅ Group A — fixed grid, no resize (Files, Docs) — both done

Both left columns stayed trees rather than `<ListCard>` lists — the deliberate
exception this section always recorded. Three things came out of doing them
that the next port should expect:

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

The hand-rolled resizers in Notes / Pages / Tables are still invisible — they
get the grip for free when they move to `MasterDetail`. Do not patch them
separately.

---

## 9. Suggested order

1. ~~**Docs**~~ — ✅ done.
2. ~~**Files**~~ — ✅ done.
3. **Tables** — first DIY-resizer removal; decide the saved-width migration here
   and apply that decision to the rest.
4. **Notes** — DIY resizer + focus mode together.
5. **Pages** — the biggest (1192 lines) and the one with both, so it goes last
   with everything else already proven.
6. **Draw** — focus mode, fixed width; could equally go earlier, it is small.

§8 (`RailHandle`'s grip) is ✅ done — it was independent of all six and touched
one shared file.

After the last one, `components/layout/focus-layout.ts` and its test should be
deletable — Pages and Draw are its only importers. That is the signal the job
is finished.

One loose end when you delete it: `components/layout/zen-mode.ts` names
`focus-layout.ts` in a doc comment (not an import, so nothing breaks and
nothing warns). Update that comment to point at `MasterDetail`'s
`listCollapsed` instead, or the next reader goes looking for a file that is
no longer there.
