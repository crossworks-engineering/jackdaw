# Handover: /pages — cards, drill-down, pagination, and the editor's width (2026-08-19)

**For the next session.** Four changes Jason asked for on `/pages`, in his words:

1. **The list column should be CARDS**, like the rest of the system. Today each
   page is "its own string" — a single line, out of scope with every other list.
2. **The grab handle on the left and the actions inline on the right eat the
   title**, so items are hard to find. Move the controls to the BOTTOM of the
   card, write the title out in full, and show how many children it has.
   Dragging a card onto another makes it a child of that card.
3. **Drill-down.** Clicking a card opens the page on the right as usual; if it
   has children, the list column shows the CHILDREN, with a breadcrumb at the
   top — `← Back to <parent>`. Repeats to any depth.
4. **Pagination for pages.**

And a fifth, added after: **the page CONTENT must hug left by default like
everything else, and get a drag bar with no limit on its horizontal space** —
the same treatment `/settings/appearance` just got.

Read §3 before designing anything. Three of its five findings change what the
work actually is.

---

## 1. Where the code is

| what | where |
|---|---|
| List screen (the subject) | `client/web/app/(app)/pages/pages-client.tsx` (1103 lines) |
| The tree row Jason is describing | same file, `TreeRow` at **:719–878** (its doc comment from :714 is worth reading first) |
| The card that ALREADY exists | same file, **:559–590** (filtered mode) |
| The pager that ALREADY exists | same file, **:595–625** |
| Editor route (ask 5) | `client/web/app/(app)/pages/[id]/page-detail-client.tsx`, width at **:1043** |
| Wire types | `PageRow` in `@crossworks/client-types`; `PagesListResponse` at pages-client **:121** |

The screen is already on `MasterDetail` (`id="pages"`, `detailFills`,
`listCollapsed={zen}`) and its params are already URL-driven (`q`, `tag`,
`sort`, `page`) through a `go()` + `useTransition` pair.

---

## 2. What the list does today

`/api/pages` answers `{ mode, pages, total, page, pageSize, tags }` and the
screen renders **two completely different lists** off it:

- **`mode: 'tree'`** — the default, when nothing is searched or filtered. This
  is the one Jason is complaining about: a grip button in a fixed left gutter,
  a chevron indented by `depth * 16`, the title, and three hover-revealed icon
  buttons (Move to… / Add sub-page / Delete) on the right.
- **`mode: 'list'`** — whenever `q` or `tag` is set. This one **already renders
  `ListCard`s** with the icon, title, summary and tag pills.

So the card treatment Jason wants is not new work in the abstract — it exists in
this very file, twelve lines below the tree. The tree is the odd one out.

---

## 3. ⚠ Five findings, and three of them change the job

### 3a. Pagination and the tree are the SAME change, not two

The pager at :595 is wrapped in `{mode === 'list' && …}`. Tree mode gets a
count and no controls — because **a tree is not a list and cannot be paged**.
Page 2 of a tree is meaningless: you would cut it mid-branch.

Drill-down is exactly what fixes that. Once the column shows ONE LEVEL at a time
— top-level pages, then the children of X — every view is a flat list, and it
paginates like `/traces` or `/audit` do. **Ask 3 is what makes ask 4 possible.**
Do them as one change; doing 4 first has nothing to page.

### 3b. Tree mode already ships the ENTIRE tree to the client

The client builds `childrenByParent` from `pages` (:188), which only works if
the payload is complete. The code says so out loud at :171–174:

> the client doesn't hold the whole tree — *in filtered/paginated 'list' mode*

…implying tree mode does. That is why there is no pager: the endpoint hands over
everything.

Two consequences, and they pull in opposite directions:

- **The good one:** drill-down, child counts and per-level pagination can all be
  done **client-side today, with no API change**. The data is already here.
- **The bad one:** that does NOT fix what pagination is *for*. A brain with 2000
  pages still ships 2000 rows on every visit to `/pages`.

### 3c. `/api/pages` is a MANTLE endpoint

There is no `app/api` in `client/web` — `apiFetch` targets the brain. So the
proper fix (`?parent=<id>`, a `childCount` per row, real server-side paging of a
level) is **a mantle change and a package release**, exactly like the nav
collapse in [`handover-settings-nav-mantle.md`](./handover-settings-nav-mantle.md).

**Recommended split, and it mirrors what we just did for the sidebar:**

1. **Now, in jackdaw:** build the cards, the drill-down, the breadcrumb and the
   per-level pager against the payload that already arrives. Ships immediately,
   no release, and the UI is finished.
2. **Then, in mantle:** add `parent` + `childCount` + level paging so the
   payload stops being the whole corpus. The client change is then swapping the
   source of two numbers — the components do not move.

Write step 2 into the mantle handover when step 1 lands, so the two travel
together.

### 3d. `PageRow` has no child count

```ts
type PageRow = { id, parentId, title, icon, tags, summary, visibility, width, createdAt, updatedAt }
```

No `childCount`. In tree mode derive it from `childrenByParent` (already built).
In list/search mode it is not derivable — decide whether a searched card shows
no count, or waits for 3c. There IS a `/api/pages/:id/descendant-count` endpoint
(used by the delete warning at :199), but it counts DESCENDANTS, not children,
and one request per card is not a list.

### 3e. Ask 5 is about the EDITOR, and it revisits a decision already recorded

The list screen's preview **already hugs left and already has no cap** — it
passes `detailFills` (:459) with a comment explaining why, and
`e2e/specs/pages-reading-width.spec.ts` pins it. Nothing to do there.

What still centres is the **editor at `/pages/[id]`**, line 1043:

```tsx
className={cn('mx-auto w-full', width !== 'wide' ? 'max-w-3xl' : 'max-w-none')}
```

⚠ That `width` is `data.width`, the **per-page narrow/wide toggle**, and
[`handover-settings-endgame.md`](./handover-settings-endgame.md) §7 records a
decision that it stays: *"the workspace width toggle is gone; the EDITOR at
/pages/[id] keeps its own."* Ask 5 overrides that. Say so in the commit rather
than letting the two documents disagree.

Also note the editor has **no divider to drag** — it is a standalone route, not
a master-detail. Giving it "a drag bar with no limit" means introducing a
resizable pair (content + spacer) with its own persisted id, the same primitive
`MasterDetail` uses internally. And the `xl:` outline rail (`aside w-56` at
:1035) sits beside the content, so it has to be part of whatever new layout
holds the drag bar.

**Open decision:** does `data.width` disappear (replaced by the dragged width,
persisted per screen), or does it survive as the seed for a page that has never
been dragged? Jason has not said. The narrow/wide toggle and a free drag are two
answers to one question, and keeping both is the worst of it.

---

## 4. The design as specified

```
┌─ list column ──────────────┐
│ ← Back to Architecture     │  breadcrumb, only when drilled in
├────────────────────────────┤
│ 📄 Deployment topology     │  full title, wrapped — not truncated
│    3 sub-pages             │  child count
│    [move] [+ child] [del]  │  controls at the BOTTOM, inside the card
├────────────────────────────┤
│ …                          │
├────────────────────────────┤
│ 24 pages · 1 / 3  ‹  ›     │  pager, per level
└────────────────────────────┘
```

- **Click a card** → opens that page in the detail pane AND, if it has children,
  drills the list into them. Both, per Jason's description.
- **Drag a card onto another** → becomes its child. The mechanic already exists:
  `useDroppable({ id: row.id })` per row and `onMove(parentId)`. A card is a much
  bigger drop target than a 28px row, so this gets better by itself.
- **Breadcrumb** → back to the parent's level.

### ⚠ The state that comes with it

- **Put the drilled parent in the URL** (`?parent=<id>`), like `q`/`tag`/`sort`/
  `page` already are. Deep links keep working, back/forward behave, and the
  pager composes as `?parent=X&page=2`. Note `selectedId` is currently local
  state (:174) — the screen is already inconsistent about this; do not make it
  worse.
- **Searching must exit the drill-down.** `q`/`tag` produce cross-level results
  (`mode: 'list'`), which have no parent to be under. Clear `parent` when a
  search starts, and hide the breadcrumb.
- **`expanded` (:175), the chevrons and `depth * 16` all go away.** Drill-down
  replaces expand-in-place. Deleting that state is most of the diff.

---

## 5. Traps

1. ⚠ **Keep `data-mark-id` / `data-mark-kind` / `data-mark-label`** on whatever
   element represents a page (:562–564 and :805–807). They are read by the
   marking system; a card that drops them silently breaks it.
2. ⚠ **Drag cannot cross a page boundary.** Once a level paginates, the card you
   want to drop onto may be on page 2. The `Move to…` dropdown (:820) already
   lists every page and is the escape hatch — do not delete it when the controls
   move to the bottom of the card.
3. ⚠ **The un-nest target needs a new home.** `TopLevelDropZone` (:551) appears
   only while dragging a page that has a parent. In a drilled-in level the
   natural target is the breadcrumb itself — "drop here to move up to X".
4. **Focus mode collapses the list** (`listCollapsed={zen}`), and the breadcrumb
   lives in the list. Check the round trip: drill in, focus, unfocus.
5. **`placeholderData: (prev) => prev`** (:157) keeps the old list on screen
   while paging. With drill-down that means you can briefly see the WRONG
   level's cards. Key the list on `parent` so it clears.
6. **The delete warning counts descendants, not children** (:199). A card
   showing "3 sub-pages" and a dialog saying "12 pages will be deleted" are both
   right; make sure the wording does not read like a contradiction.

---

## 6. Coverage

`pages-crud.spec.ts`, `pages-reading-width.spec.ts` and the `/pages` row in
`master-detail-screens.spec.ts` exist; `focus-mode.spec.ts` covers the collapse.
What to add:

- A card carries the full title, the child count, and its controls.
- Clicking a parent opens it AND drills; the breadcrumb goes back to the level
  it came from.
- Drag card A onto card B → A's `parentId` is B (assert through the API, not
  just the DOM — a synthetic drag that never registers leaves the tree untouched
  and a DOM-only assertion goes green).
- The pager pages a LEVEL, and `?parent=…&page=2` survives a reload.
- Searching clears the drill-down.
- Ask 5: the editor content starts at the left edge (not centred) and widens
  when the new drag bar moves — the same two assertions
  `settings-hub.spec.ts` uses for Appearance.

⚠ **Wait for `[data-slot="resizable-handle"]` before touching the list** —
`MasterDetail` swaps from a CSS grid to panels on mount, and a test that tags
the list before that swap is racing a remount. It has cost two debugging cycles
already.

---

## 7. What NOT to do

- **Do not paginate the tree.** §3a. Paginate a level, once drill-down exists.
- **Do not add a per-card `descendant-count` fetch.** §3d — that is one request
  per row.
- **Do not touch the list preview's width.** It already hugs left and fills;
  `pages-reading-width.spec.ts` will tell you so. Ask 5 is the editor route.
- **Do not keep the narrow/wide toggle AND a free drag** without deciding which
  wins. §3e.
- **Do not delete `Move to…`** when the controls move into the card. §5.2.
