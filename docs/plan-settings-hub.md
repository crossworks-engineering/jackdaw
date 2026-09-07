# Plan: a card-list hub for the settings screens that have no list (2026-08-18)

> ⚠ **Superseded (2026-08-22).** The hub this plan describes shipped (§8) and
> was then **undone** in `c7af6a6` — see [§9](#9-undone--the-cards-go-the-pane-stays-2026-08-22).
> What survived is the pane, not the cards. Step 5, the mantle-side nav
> collapse, is withdrawn rather than pending.

Half the settings cluster is a master-detail screen with a list of things
(accounts, agents, API keys). The other half is a single panel with no
collection behind it (Profile, Appearance, Microsoft, Backups…). Today both
halves are flat entries in one 24-item nav group, and the single-panel ones each
centre their content in an `mx-auto max-w-2xl` column that no divider governs.

This plan gives the second half the shape `/debug` just got: **one card per
screen in a left list — name, description, live stat — and the screen itself in
the detail pane, tucked left against a draggable divider.**

---

## 1. The survey — which screens are which

Counted from the tree, not from memory. 26 directories under
`app/(app)/settings`.

### 1a — has a list already (12). **Not in scope.**

`accounts`¹ · `agents` · `ai-workers` · `config` · `heartbeats` · `keys` ·
`peers` · `skills` · `tool-groups` · `tools` · `users` · `worker-groups`¹

¹ already on `MasterDetail`; the other ten are still hand-written grids and are
the existing §2b backlog in [`handover-settings-screens.md`](./handover-settings-screens.md).

These keep their own nav entries. They are already "a list of things".

### 1b — single panel, no list (13). **This is the batch.**

| screen | lines | data behind it | a stat the card could carry |
|---|---|---|---|
| `profile` | 577 | `/api/profile` | who you are signed in as |
| `appearance` | 181 | none (client-side) | current mode · theme name |
| `microsoft` | 910 | `/api/microsoft/accounts`, `/config` | N connected · or "not configured" |
| `calendar` | 281 | `/api/calendar` | N calendars syncing |
| `discover` | 216 | `/api/email/discover` | N contacts waiting to be confirmed |
| `mcp` | 274 | `/api/mcp-settings`, `/api/mcp-status` | N servers · M connected |
| `embedding` | 622 | `/api/embedding` | model · dimension |
| `network` | 703 | `/api/network` | active / inactive · N peers |
| `entities` | 185 | `/api/entities/candidates` | **N merge candidates waiting** |
| `pdf-passwords` | 181 | `/api/pdf-passwords` | N stored |
| `backups` | 292 | `/api/backups` | last backup, relative |
| `updates` | 634 | `/api/updates`, `/status` | **current version · update available** |
| `audit` | 267 | `/api/audit` | N events in the window |

The two in bold are the ones a card earns its place on: they are *actionable*
and today you only find out by opening the screen.

### 1c — the odd one out

`security` is a **14-line redirect stub** to `/settings/users`, kept because the
route was linked from help text and bookmarks. It gets no card. Leave the stub.

⚠ `discover` **has no nav entry at all** today — it is reached only from a link
inside the mail client. Giving it a card is a small feature, not just a re-shape.
Decide deliberately whether it should be discoverable.

> **CORRECTION (2026-08-18): the paragraph above is wrong.** `discover` DOES
> have a nav entry — `{ name: 'Discover', href: '/settings/discover', icon:
> UserCheck }` in the **Review** group of `NAV_GROUPS`, beside Team, Pending and
> Team Portal. It was given a hub card anyway (Jason's call), which stands on its
> own merits, but the card is a SECOND door rather than the only one. The claim
> was made by reading the settings DIRECTORY and not the nav list. See
> [`handover-settings-nav-mantle.md`](./handover-settings-nav-mantle.md) §3a.

---

## 2. ⚠ The constraint that shapes everything: the nav is not in this repo

`packages/web-ui/src/layout/nav-items.ts` is one line:

```ts
export * from '@mantle/share-ui/nav-items';
```

The real `NAV_GROUPS` — all 24 Settings entries, the `headSize: 5` fold, the
`defaultHead` cold-start list — lives in **`@crossworks/share-ui`, a package
built in the mantle repo**. So:

- **The card list, the hub route and the layout are a jackdaw change.** They can
  ship on their own.
- **Changing what the sidebar lists is a mantle change**, released as a package
  version and picked up here on upgrade. It cannot land in the same commit.

That splits the work in two, and the order matters: ship the hub first, leave
the 13 nav entries in place, and only collapse them to one entry once the hub is
proven. A nav that points at screens the hub also lists is redundant but
harmless; a nav that points at nothing is a broken build.

---

## 3. The name — one decision, and it is yours

The user's brief says "a new Settings (better name)". Three candidates:

| name | route | reads well for | reads badly for |
|---|---|---|---|
| **Settings** (recommended) | `/settings` | everything — it is what these are | nothing, but it is not a *new* name |
| Preferences | `/settings/preferences` | Profile, Appearance | Backups, Updates, Local network |
| Setup | `/settings/setup` | Microsoft, Calendars, MCP, Network | Appearance, Audit log |

**Recommendation: keep `Settings` and put the hub at `/settings`.**

The reason is concrete: **`/settings` has no `page.tsx` today** — the route is
unclaimed. Making it the hub costs no redirect, no new vocabulary, and no
bookmark breakage. The collection screens (accounts, agents, keys…) are the ones
that do not belong under a hub, and they already have their own nav entries; the
distinction the user is drawing is real, but the *name* for it is "settings" and
the odd ones out are the lists.

If a new word is wanted anyway, **Setup** fits more of the thirteen than
Preferences does.

---

## 4. The shape

Exactly the `/debug` pattern, which is now proven and specced.

```
client/web/app/(app)/settings/
  layout.tsx        ← NEW. Wraps ONLY the hub routes, not the whole cluster.
  settings-nav.tsx  ← NEW. The card list.
  page.tsx          ← NEW. Lands on the first card, or an explainer.
```

⚠ **The layout must not wrap the whole `settings/` directory.** A Next layout
applies to every route beneath it, so a `settings/layout.tsx` would put the hub
rail beside `/settings/agents` too — a list inside a list. Two ways out:

1. **Route group**: `settings/(hub)/layout.tsx` with the thirteen screens moved
   under `(hub)/`. URLs are unchanged (route groups do not appear in the path).
   Cleanest, and it is why the feature exists.
2. A single `/settings` page that renders the cards and the selected screen
   itself, keyed on `?panel=`. Fewer files, but every panel becomes a client
   import and the route loses its own URL.

**Take option 1.** Option 2 throws away deep links that already exist.

### The nav component

Copy [`debug-nav.tsx`](../client/web/app/(app)/debug/debug-nav.tsx) almost
verbatim — it is the reference implementation:

- `ListCard asChild` wrapping a `<Link>`, `selected` from `usePathname()`.
- `ListCardTitle` + description + a stat line; `warn` styling with
  `TriangleAlert` for anything actionable.
- **Stat queries reuse each screen's own react-query key and URL**, so the card
  and the screen share one cache entry instead of fetching twice.
- **The nav lives in the layout**, so those queries mount once for the section
  rather than refiring on every card click.

### Widths

```tsx
<MasterDetail
  id="settings-hub"
  defaultListSize="380px"   // same as /debug — cards carry two lines under the title
  minListSize="300px"
  maxListSize="560px"
  // NO detailFills: these are forms, and the 672px default measure is what
  // keeps them off 1200px line lengths.
/>
```

### ⚠ Then delete the inner caps

This is the half that actually answers "left aligned sizable content". Every one
of the thirteen currently centres itself:

```
backups/page.tsx:17         mx-auto max-w-2xl
calendar/page.tsx:14        mx-auto max-w-2xl
discover/page.tsx:13        mx-auto max-w-2xl
microsoft-client.tsx:65     mx-auto max-w-2xl
profile/page.tsx:14         mx-auto max-w-2xl
updates-client.tsx:457      mx-auto w-full max-w-2xl
network-client.tsx:60       mx-auto w-full max-w-3xl
embedding-client.tsx:227    mx-auto w-full max-w-3xl
entities-client.tsx:135     mx-auto max-w-7xl
```

A pane that is already a measure **and** draggable, with a second cap inside it,
means the drag does nothing. That is the exact bug `/pages` had and the same one
just fixed in `accounts` (three caps). **Drop `mx-auto` and the `max-w-*`; keep
the padding.** The divider becomes the measure.

---

## 5. Order

1. **The route group + layout + nav with descriptions only.** No stats. Proves
   the shape and the deep links in one commit.
2. **Drop the nine inner width caps.** Small, mechanical, immediately visible.
3. **Stats, cheapest first** — `updates`, `entities`, `mcp`, `network`,
   `backups`. These five are the ones worth knowing before you click.
4. **The rest of the stats**, or leave them description-only where the data
   costs a real request. `/debug` set the precedent: `sanity` and `integrity`
   are deliberately not fetched, and the card says so out loud.
5. **The mantle-side nav change** — collapse the thirteen Settings entries to
   one. Separate repo, separate release. Only after 1–4 have shipped.

---

## 6. Coverage

- **One row** in `e2e/specs/master-detail-screens.spec.ts` (`/settings`,
  id `settings-hub`) — panes, persisted width, one scrollbar, server render.
- **One per-screen spec**, modelled on
  [`debug-nav.spec.ts`](../e2e/specs/debug-nav.spec.ts): a card per screen, the
  open one is selected, clicking navigates, and **the nav does not remount**.
- ⚠ **Wait for `[data-slot="resizable-handle"]` before touching the list.**
  `MasterDetail` paints a CSS grid until `useMediaQuery` resolves and then swaps
  to the panels, so the list subtree is rebuilt once on mount. A test that tags
  the list before that swap is racing it — green alone, red in a full run. This
  already cost one debugging cycle on `/debug`.
- **A width guard**, the `/pages` one: prose/form fills the pane and is not
  centred. It is the only thing that proves §4's caps actually went.

---

## 7. What this does NOT do

- It does not touch the twelve list screens. Their §6 form work is the separate,
  larger backlog in `handover-settings-screens.md` §2b.
- It does not remove any route. Every `/settings/<name>` URL keeps working; a
  route group changes the file tree, not the path.
- It does not change the sidebar. That is step 5, in the other repo.

---

## 8. Shipped — steps 1 to 3 (2026-08-18)

> ⚠ Read with §9. Everything below was true for four days: the cards, the
> explainer at `/settings`, the five stat lines and `settings-hub.spec.ts` are
> all gone, and step 5 is moot. The width-cap removals and the pane survived.

Two commits. **Steps 1, 2 and 3 are done; step 4 was answered by doing step 3;
step 5 is the mantle-side nav change and is still open.**

### The two decisions §2 and §3 left open — answered by Jason

- **The hub keeps the name "Settings" and sits at `/settings`.** The route was
  unclaimed, so it cost no redirect and broke no bookmark.
- **`discover` gets a card.** It has no nav entry at all today and is reachable
  only from a link inside the mail client, so this is a small feature, not only
  a re-shape. Thirteen cards, not twelve.

### What landed

`settings/(hub)/` — `layout.tsx`, `settings-nav.tsx`, `page.tsx`, and the
thirteen screens moved under the group. Option 1 from §4, as recommended: URLs
are unchanged, so every `/settings/<name>` deep link still works and the twelve
collection screens (plus the `security` redirect stub) stayed outside.

`/settings` is an **explainer, not a redirect to the first card.** A redirect
would answer a question the reader has not asked, and the back button would
bounce off it.

**Twelve caps dropped**, not the nine §4 counted: the sweep missed
`mcp/mcp-client.tsx` and `pdf-passwords-client.tsx`. `pdf-passwords` keeps ONE
`mx-auto` — an error empty-state, which is centred on purpose.

**Five stat lines**, exactly the five §5 named. Each reuses its screen's own
queryKey and URL. On the scratch brain they read: `off` · `connected · 9
devices` · `nothing to review` · `off — no scheduled backups` ·
`0.230.66 → 0.230.67 available`.

⚠ The update line uses `latest.version`, **not `latest.tag`** — the tag carries
a leading `v` that `currentVersion` does not, and `0.230.66 → v0.230.67` reads
like two different kinds of thing.

### Coverage, and one nearly-vacuous test

One row in `master-detail-screens.spec.ts` plus `settings-hub.spec.ts` (5
tests). Both structural guards were verified against the bug they exist for: the
profile cap put back fails only the width test, and keying the nav on the
pathname fails only the remount test.

⚠ **The first stats test matched `/on|off/` against the MCP card's whole text —
and its own description contains the word "connect*or*".** It would have passed
with no stat rendered at all. The stat line carries
`data-testid="settings-nav-stat"` now, and the test asserts exactly five of
them, each one's reading, and that Profile has none.

### Step 5 is NOT done, and cannot be done here

> ⚠ Moot since 2026-08-22 — §9. Do not do it.

**Written up for a mantle session in
[`handover-settings-nav-mantle.md`](./handover-settings-nav-mantle.md)** —
including two findings that contradict this plan: `discover` DOES have a nav
entry (in the Review group, not Settings), and deleting the twelve items would
break ⌘K name search, so they must be hidden rather than removed.

The sidebar still lists all thirteen screens individually, so the nav and the
hub are redundant but consistent. Collapsing those thirteen entries to one is a
change to `NAV_GROUPS` in **`@crossworks/share-ui`, built in the mantle repo** —
a package release picked up here on upgrade. §2's ordering advice held and still
holds: the hub shipped first, the nav points at screens that all still exist,
and nothing is broken while step 5 waits.

---

## 9. Undone — the cards go, the pane stays (2026-08-22)

`c7af6a6` — *"the settings screens come back to the menu, and pick up
favourites"*. Jason asked for it, and the reason was concrete: folding thirteen
rows behind one "Settings" entry had broken the sidebar's **filter box**.
Typing "backups" matched nothing, because the item the filter reads was no
longer in the sidebar's copy of the list. ⌘K still found them; the menu did not.
A hub that hides screens from the one control built to find them is the wrong
trade, so the collapse went, and with it the reason for the hub.

### What is gone

- `settings/(hub)/settings-nav.tsx` — the card list — and `lib/settings-hub-nav.ts`,
  the render-time collapse. Deleted, not disabled.
- The five stat lines. They lived on the cards.
- The `/settings` explainer. The URL is now a **redirect to `/settings/profile`**
  — it has been a real linkable address, and a 404 is a worse answer than a
  landing. §8's "explainer, not a redirect" reasoning no longer applies: there
  is no card list for a landing state to leave unselected.
- `e2e/specs/settings-hub.spec.ts` and the `/settings` row in
  `master-detail-screens.spec.ts`. Both asserted markup that no longer exists.

### What survived, and is the point

- **The pane.** `MeasuredPane` (`packages/web-ui/src/ui/measured-pane.tsx`) is
  `MasterDetail` minus the list: one measured column, a draggable right edge,
  an empty spacer for it to pull against. `(hub)/layout.tsx` wraps the thirteen
  screens in it and nothing else. The route group **must stay** for §4's
  original reason — a `settings/layout.tsx` would wrap the twelve collection
  screens too.
- **Widths per screen, not per section.** The pane is keyed
  `settings:${pathname}`. One shared key meant dragging Appearance wide silently
  widened Profile.
- **Appearance opens at 1344px**, double the 672px form measure — it is a
  gallery, and at a form's width it was a cramped strip beside an empty spacer.
  Still draggable, still remembered; only where it opens changed.
- **The twelve inner width caps stay dropped**, and the padding fixes with them.
- **Most-specific-wins highlighting.** `activeNavHref` moved from
  `settings-hub-nav.ts` to `client/web/lib/nav-active.ts`. It was never really
  about the hub, and it also settles the duplicate row a starred favourite makes.

The same commit added **Favorites** — a star on every row, starred rows pinned
in a group at the top, stored per browser. That is a sidebar feature, not part
of this plan; it is mentioned because it is why `nav-active.ts` still earns its
keep.

### Coverage now

`e2e/specs/settings-pane.spec.ts` replaces `settings-hub.spec.ts`. It holds what
survived: a `MeasuredPane` per screen keyed on its own path with a remembered
width and no list panel; the 672px/1344px opening widths; that a width dragged
on one screen does not follow to another; the redirect; the no-ceiling drag,
the fill-the-pane check and the padding check carried over from the hub spec;
that the filter finds "backups" again; and most-specific-wins highlighting. It
scopes by the pane's own id, because there is no `[data-testid="list"]` — and
it asserts there is none, since a list coming back would mean the hub had.

### Step 5 is withdrawn

The sidebar listing every settings screen is now the **intended** state, not a
redundancy waiting on a mantle release. `handover-settings-nav-mantle.md` is
marked withdrawn and kept only for its §3 findings, which are still true:
`discover` lives in Review, and deleting nav items would break ⌘K. Do not add
`hubOnly`, a `/settings` item, or the `defaultHead` change it proposed.
