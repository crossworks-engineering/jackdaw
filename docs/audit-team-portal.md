# Audit: /team — what drifted while the owner app was rebuilt (2026-08-19)

**Scope.** The member-facing `/team` workspace, audited against
[`ui-style-guide.md`](ui-style-guide.md) and against the owner app as it stands
after the settings endgame, the resizable-columns roll and the card work.

**Method.** Static read of the source, plus the owner screens as the reference
implementation, plus one direct DOM measurement (§2a) where reading the CSS was
not enough to settle the question. No screen was loaded against a live brain —
the fixes below are typechecked and linted, not exercised.

**The one-line summary.** `/team` was built as "a read-only mirror of the owner
app shell's geometry" (its own doc comment). The owner shell has since moved its
chrome into the left rail, put every list screen on a draggable
`<MasterDetail>`, and standardised the list card. `/team` mirrors none of that
any more — it is the last surface still on the pre-rework shape.

---

## Status — everything below §1–§7 is done

| § | what | commit |
|---|---|---|
| 2 | the app cut-off, all three causes | `1bc33ab` + `f5f611d` |
| 3 | `MasterDetail` port + the guide's stale legacy list | `c68c23c` |
| 1 | the shell: header and footer out, rail owns the chrome | `14e5d33` |
| 4, 5, 7 | the card, the detail header, seven conformance slips | `f854a72` |
| 6 | the owner rail's banned hover (fix ran the OTHER way) | `5d40eab` |

Typecheck and lint pass on all of it. **None of it has been exercised in a
running app** — the CSS was measured directly (§2a below) but no screen was
loaded against a live brain. §9 and §11 remain open.

---

## 1. The shell: `/team` still has the header and footer the owner app deleted

Style guide §8, *"No header, no footer — the rail owns the chrome"*: the shell
has NO fixed header and NO footer bar; every control they held lives in the left
rail (`components/layout/rail/`).

`/team` has both. [`team-workspace-shell.tsx:182`](../client/web/components/team-workspace/team-workspace-shell.tsx#L182)
is an `h-14` header; [`:265`](../client/web/components/team-workspace/team-workspace-shell.tsx#L265)
is an `h-11` footer. Between them sits a plain `w-56` aside
([`:258`](../client/web/components/team-workspace/team-workspace-shell.tsx#L258)).

What each holds today, and where the owner app puts the same thing:

| `/team` today | owner equivalent |
|---|---|
| header: wordmark / brand logo, peer name | `rail/brand-block.tsx`, top of the rail |
| header: member name, `ThemeToggle` | `rail/profile-menu.tsx` + `rail/rail-controls.tsx`, in the rail |
| header: mobile `Menu` sheet trigger | `rail/mobile-bar.tsx`, the `--top-bar-h` mobile-only bar |
| footer: shared-folder chips | no owner twin — these want a rail section |
| footer: a "Forum" button | **already the second nav entry** (`WORKSPACE_NAV`, `:71`) — a duplicate |
| aside: fixed `w-56`, no handle | `RailHandle`, cookie-persisted, publishes `--nav-w` |

Consequences beyond the look:

- **No `--nav-w` / `--top-bar-h`.** `/team` hardcodes `w-56` and `h-14`. Nothing
  on the surface can offset against a rail the way §8 requires, so a future
  full-screen overlay here has nothing to read.
- **No collapse.** ⌘B does nothing on `/team`; the rail is not collapsible and
  has no grip, which §8 calls "an invisible one".
- **The footer costs 44px of every screen** for two folder chips and a duplicate
  button, on the one surface whose main pane is a reader.

## 2. Apps cut off at the bottom — three causes across two screens

This is the bug you reported. It turned out to be three separate faults, and the
third is on the OWNER screen, not `/team`.

### 2a. `/apps` served a 150px app viewport, whatever the app ⚠ the big one

Found while porting `/team`, by measuring rather than reading. The `/apps`
detail node sized itself `flex min-h-0 flex-1 flex-col`. That `flex-1` never did
anything: `MasterDetail`'s detail wrapper is a **block**
(`relative h-full min-h-0 overflow-y-auto`), and flex properties apply only to
flex *items*. The node fell back to content height, nothing below it had a
definite parent to resolve a percentage against, and `AppSandbox`'s `h-full` —
then the iframe's — collapsed to the intrinsic height of a replaced element.

Measured on the real DOM, a 400px pane:

| detail node | iframe |
|---|---|
| `flex min-h-0 flex-1 flex-col` (what shipped) | **150px** |
| `flex h-full min-h-0 flex-col` | 382px (pane − header − padding) |

The `viewport` frame deliberately reports no content height, so there was
nothing to fall back on. Every other ported screen already used `h-full`
(`app-detail-client`, `team-admin`, `tools`, `traces`, `contacts`, `agents`);
`/apps` was the only one on `flex-1`, which is why nothing else showed it. The
rule was written down nowhere — §8 now carries it.

The two `/team` causes below are unrelated to this one.

### 2b. `/team` rendered apps in `card` frame; everything else uses `viewport`

[`share-reader.tsx:159`](../client/web/components/team-workspace/share-reader.tsx#L159):

```tsx
{view.kind === 'app' && (
  <div className="p-4">
    <AppSandbox appId={view.appId} shareToken={token} />   {/* frame defaults to 'card' */}
  </div>
)}
```

`AppSandbox`'s `card` mode auto-sizes the iframe to the height the app reports,
**clamped**: `setHeight(Math.max(80, Math.min(4000, …)))`
([`app-sandbox.tsx:237`](../../mantle/packages/share-ui/src/app-sandbox.tsx#L237)).
An app taller than 4000px is cut off with no scrollbar of its own — exactly the
symptom. `card` mode also breaks viewport units inside the app, which the prop's
own doc comment says outright.

Both other surfaces already moved:

| surface | frame |
|---|---|
| owner `/apps` ([`apps-client.tsx:295`](<../client/web/app/(app)/apps/apps-client.tsx#L295>)) | `viewport`, inside `min-h-0 flex-1` |
| `/hub` ([`team-hub-client.tsx:288`](../client/web/components/team-chat/team-hub-client.tsx#L288)) | `viewport` |
| **`/team` reader** | **`card`** ← the holdout |

Fix is the owner shape: `frame="viewport"` in a `min-h-0 flex-1` parent, dropping
the `p-4`. The app then fills the pane and owns its own scrolling — no clamp.

### 2c. The reader's scroll container was missing `relative`

[`share-reader.tsx:140`](../client/web/components/team-workspace/share-reader.tsx#L140)
is `min-h-0 flex-1 overflow-y-auto scrollbar-thin bg-background` — no `relative`.
§8 is explicit that `min-h-0` is necessary but **not sufficient**: a
`position:static` `overflow-y-auto` pane leaks its scrollable overflow into the
outer scroll region when content is far taller than the viewport, producing a
second scrollbar that clips. The guide names the exact symptom ("the dreaded
double scrollbar / bottom gap / cut-off") and the exact screens it already bit.

The enclosing pane at [`team-section.tsx:420`](../client/web/components/team-workspace/team-section.tsx#L420)
is likewise `flex min-h-0 flex-col` with no `relative`.

This one hits **every** tall share — pages, tables, long tasks — not just apps.

## 3. `/team` is the last screen not on `<MasterDetail>`

38 owner screens use it. `team-section.tsx:293` still hand-rolls the grid:

```tsx
<div className="grid min-h-0 flex-1 md:grid-cols-[340px_1fr]">
```

So the list/reader divider cannot be dragged, shows no grip, and remembers
nothing. Every owner list screen does all three.

Porting it is close to mechanical — the panes already carry `min-h-0`, and the
list is already `<ListCard>` + `<ListPager>` + URL-driven params, which is the
shape `<MasterDetail>` expects. It wants `detailFills` (the reader is not a
form; the 672px measure exists to protect a form's line length) and an `id` per
section, so Notes and Tables remember their own widths — the same per-view rule
`tasks` / `tasks-board` follow, and the one `team-admin` already passes its two
tabs.

> **Doc bug.** §8 lists the remaining legacy-grid screens as "the 12 settings
> screens and `docs`/`team-admin`/`team-section`". Settings, `docs` and
> `team-admin` are all on `<MasterDetail>` now. `team-section` is the only one
> left, and the guide should say so.

## 4. The list card drifted from the owner card

[`team-section.tsx:373`](../client/web/components/team-workspace/team-section.tsx#L373)
vs owner `/pages` [`:559`](<../client/web/app/(app)/pages/pages-client.tsx#L559>):

| | owner | `/team` |
|---|---|---|
| icon | fixed `size-4 shrink-0` slot, `📄` fallback | inline `<span className="mr-1.5">`, no slot, no fallback |
| title | `truncate text-sm font-medium` | same ✅ |
| summary | `line-clamp-2 text-xs` | same ✅ |
| **tags** | **`<TagPill>` per tag** | **not rendered** |

Two consequences. The inline icon means titles don't align down the column —
rows with an icon start further right than rows without, which is precisely the
"hard to find" complaint that drove the `/pages` card work.

And the tags are **already in the data**: `Item.tags: string[]`
([`:78`](../client/web/components/team-workspace/team-section.tsx#L78)), and the
section renders a tag *filter* built from them
([`:336`](../client/web/components/team-workspace/team-section.tsx#L336)). A
member can filter by a tag they can't see on the card.

## 5. The reader header isn't the §8 detail header

§8 "Detail header anatomy" — the reference is `/pages` — opens every detail pane
with an `h2` at `text-xl font-semibold`, the icon **inside** the `h2`,
`min-w-0 truncate` on the title, `shrink-0` on the actions, tucked left.

[`team-section.tsx:427`](../client/web/components/team-workspace/team-section.tsx#L427)
is a `<p>` at `text-sm font-medium`, **centred** (`md:text-center`), icon inline
before the text. Centring is the same mistake §8 calls out for detail panes: it
walks the title away from the list it belongs to.

## 6. Nav parity — and one of these is the owner app's fault

`NavList` ([`:93`](../client/web/components/team-workspace/team-workspace-shell.tsx#L93))
vs `sidebar-nav.tsx` [`:103`](../client/web/components/layout/sidebar-nav.tsx#L103):

| | owner | `/team` |
|---|---|---|
| active fill | `bg-sidebar-accent` + `text-sidebar-accent-foreground` | same ✅ |
| `aria-current="page"` | yes | **missing** |
| count / badge | `<Badge variant="secondary">` | raw `<span className="text-xs">` |
| label overflow | `truncate` | none — a long name will push the count |
| focus ring | `focus-visible:ring-2 focus-visible:ring-ring` | none (relies on the browser default) |

**The hover is the other way round.** `/team` uses
`hover:bg-foreground/[0.06]`, which is what §2 prescribes for a `bg-sidebar`
surface and what §14 lists as the fix. The **owner** rail uses
`hover:bg-accent/60` ([`sidebar-nav.tsx:113`](../client/web/components/layout/sidebar-nav.tsx#L113)) —
the anti-pattern, verbatim: *"❌ A coloured-`accent` hover on a `bg-sidebar`
surface (muddies grey text)"*. `/team` is right; fix the owner rail, don't
propagate its hover.

## 7. Smaller conformance items

| item | where | rule |
|---|---|---|
| `size="icon"` + `className="size-8"` | `attachment-ui.tsx:274`, `topic-view-client.tsx:698` | §5 — never hand-size; `size-8` is 32px, that's `size="icon-xs"` |
| `size="sm"` + `h-7` / `h-8` | `team-section.tsx:315`, `team-workspace-shell.tsx:278` | §5 — `sm` is `h-9`; use the `xs` twin rather than shrinking it |
| `overflow-y-auto` with no `scrollbar-thin` | `topic-view-client.tsx:736` | §8 — "Scrollbars are always thin. No exceptions." |
| `rounded-xl` on the overview tiles | `team-overview.tsx:47` | §8 — `rounded-lg` for cards |
| `text-[10px]` / `text-[11px]` on message author + timestamp | `team-chat-client.tsx:111,114`; `topic-view-client.tsx:120` | §3 — `text-xs`+ for list meta; the tiny sizes are for corner badges. The badge/pill uses at `topic-view-client.tsx:116`, `attachment-ui.tsx:150` are legitimate. |
| raw `<button>` scroll-to-bottom pills | `team-chat-client.tsx:602`, `topic-view-client.tsx:821` | §4 — should be `<Button>`; their `hover:bg-accent hover:text-accent-foreground` pairing is correct, keep it |

## 8. What is NOT broken

Worth stating, because it narrows the work:

- **Colour tokens are clean.** No bare `text-primary`/`text-destructive`, no
  mixed fill/foreground pairs, no hardcoded hex or `bg-green-*`/`bg-red-*`
  anywhere on the surface.
- **No native `prompt`/`confirm`/`alert`.**
- **No raw `<input>`/`<textarea>`** except two `type="hidden"` fields in
  `open-on-server.tsx`, which carry no styling.
- **The backend contract has not drifted.** `GET /api/team/workspace`
  (`mantle/server/web/app/api/team/workspace/route.ts`) returns exactly the
  `WorkspaceData` shape the shell declares — `memberName`, `siteName`,
  `peerName`, `logoVersion`, `logoDarkVersion`, `colorTheme`, `version`,
  `counts`, `folders`. Every drift found in this audit is client-side.

## 9. One coupling to schedule around

[`handover-pages-cards.md`](handover-pages-cards.md) (queued, not started)
converts owner `/pages` tree rows into cards with drill-down and pagination.
`team-section`'s `tree` mode says in its own doc comment that it *"mirrors the
owner /pages pane exactly"* — compact rows, same search/sort/tag controls, minus
the owner actions.

So `/team/pages` is downstream of that work. Do them together, or `/team` gains
a second, larger divergence the moment `/pages` lands.


## 10. `<SetPageTitle>` is a dead channel app-wide

Found while deciding what the `/team` mobile bar should show. `usePageTitle()`
has **zero consumers**: `components/layout/header.tsx` read it and rendered the
title centred in the top bar, and that file was deleted when the chrome moved
into the rail. Nothing replaced it.

So every `<SetPageTitle title=…>` in the app — and there are many — now sets a
value nobody reads. Two consequences:

- The guide still says, in §3 and again in §14, *"page title lives in the top
  bar: don't add a big on-page `<h1>` that duplicates it"* and *"❌ A big on-page
  `<h1>` duplicating the top-bar page title"*. There is no top-bar title to
  duplicate. Screens are following a rule against a thing that no longer exists,
  which is why several read as untitled.
- `PageTitleProvider`, the context and the hook are dead weight.

This wants a decision rather than a patch: either the rail grows a title line
and `SetPageTitle` starts meaning something again, or the channel goes and the
guide's advice inverts (screens title themselves). I did not touch it — it is
owner-app scope and bigger than this audit.

## 11. Still open

- **§9's coupling.** `/team/pages` is downstream of the queued `/pages` card +
  drill-down rework. Unchanged by this batch.
- **§10 above**, which needs your call.
- **Nothing here has been run.** The CSS in §2a is measured and certain; the
  rest is static. `/team` in particular wants a pass with a real member token:
  the shell was rebuilt, and the drawer, the folder links and the mobile bar
  have never rendered.

---

## Suggested order

Each step is independently shippable; the numbering is dependency, not priority.

1. **§2, the app cut-off** — `frame="viewport"` + `relative` on both scroll
   containers. Smallest diff, fixes a reported bug, and §2b fixes tall pages and
   tables at the same time. **Verify in the browser** — this is the one finding
   whose symptom I inferred rather than observed.
2. **§3, port `team-section` to `<MasterDetail>`** — do it before §1 lands its
   own pane classes, or the port immediately rewrites them. Update the stale §8
   legacy list in the guide in the same commit.
3. **§4 + §5, the card and the detail header** — pure conformance, no behaviour.
4. **§1, the shell rebuild** — the largest, and the one that needs a decision
   from you (below).
5. **§6 + §7, nav parity and the small items** — including the owner-side hover
   fix, which belongs in its own commit against `sidebar-nav.tsx`.

## The decision §1 needs

The owner rail's chrome is account, theme, search, help, Highlight and the
Assistant. A member has none of those except theme. So "mirror the rail" is not
a mechanical port — it is a question of what a member rail *holds*:

- brand block (wordmark + peer name) — direct port
- nav — exists
- shared-folder chips — currently the footer, no owner twin
- member name + theme toggle — currently the header right
- collapse toggle + grip — new

Whether that rail should also collapse (⌘B) and persist its width like the
owner's, or stay fixed at `w-56`, is worth settling before the work starts.
