# Handover: collapse the Settings nav group (a MANTLE change)

**For a mantle session.** This is step 5 of
[`plan-settings-hub.md`](./plan-settings-hub.md) — the only part of that plan
that cannot land in jackdaw, because the nav list lives in a package built in
the mantle repo.

Steps 1–3 shipped in jackdaw and are **merged to `main`** (`b7b4b81`,
`7c94b73`, `3c915ba`); step 4 was answered by doing step 3. Nothing here is
urgent: the sidebar and the hub both point at screens that all still exist, so
today's state is redundant but correct. Read §3 before touching anything — two of its three findings contradict
the plan.

---

## 1. What already exists (jackdaw side, done)

`/settings` is now a card-list hub: thirteen single-panel settings screens, one
`ListCard` each, the screen itself in the detail pane.

- Route group `client/web/app/(app)/settings/(hub)/` — `layout.tsx`,
  `settings-nav.tsx`, `page.tsx`, and the thirteen screens under it. **URLs are
  unchanged**; a route group is a file-tree device only.
- The twelve COLLECTION screens (accounts, agents, ai-workers, config,
  heartbeats, keys, peers, skills, tool-groups, tools, users, worker-groups)
  stayed outside the group. They are already lists and are not in the hub.
- Five cards carry a live stat; the hub is covered by
  `e2e/specs/settings-hub.spec.ts` and one row in
  `master-detail-screens.spec.ts`.

**The thirteen hub screens**, by href:

```
/settings/profile     /settings/appearance   /settings/microsoft
/settings/calendar    /settings/discover     /settings/mcp
/settings/embedding   /settings/network      /settings/entities
/settings/pdf-passwords  /settings/backups   /settings/updates
/settings/audit
```

---

## 2. The job

`NAV_GROUPS`' **Settings group has 24 items**. Twelve of them are hub screens
(the thirteenth, `discover`, is in the **Review** group — see §3a). The sidebar
therefore lists every screen the hub also lists.

The intent: **the sidebar should offer "Settings" once**, and the hub should be
how you get to the thirteen. The collection screens keep their own entries.

File: **`src/nav-items.ts`** in `@crossworks/share-ui` (mantle repo). Consumed
in jackdaw through a one-line re-export at
`packages/web-ui/src/layout/nav-items.ts`.

---

## 3. ⚠ Three findings — read these before editing

### 3a. `discover` DOES have a nav entry. The plan says it does not.

`plan-settings-hub.md` §1c states discover "has no nav entry at all today — it
is reached only from a link inside the mail client." **That is wrong.**
`nav-items.ts` has it in the **Review** group:

```ts
{ name: 'Discover', href: '/settings/discover', icon: UserCheck },
```

It sits beside Team, Pending and Team Portal — owner-space pointed at people who
are not the owner. That is a defensible home for it, and it is NOT part of the
Settings group being collapsed.

**Decision needed:** leave Discover in Review (recommended — the hub card is a
second door, not a replacement) or move it into the collapse. It is now reachable
three ways: Review nav, hub card, mail-client link.

### 3b. Deleting items breaks ⌘K, not just the sidebar

`ALL_NAV_ITEMS` is `NAV_GROUPS.flatMap(g => g.items)`, and the search palette
(`client/web/components/search/search-palette.tsx:110`) filters it by name.
**Delete the twelve items and typing "backups" or "audit log" into ⌘K stops
finding them.** That is a worse regression than the redundancy being fixed.

`matchNavItem` also feeds usage tracking (`app-shell.tsx:303`), so deleted hrefs
stop being attributed at all.

**Recommendation: hide, do not delete.** Add a field to `NavItem`:

```ts
/** Listed by the /settings hub, so the sidebar does not repeat it. Still in
 *  ALL_NAV_ITEMS, so ⌘K finds it by name and usage still attributes to it. */
hubOnly?: boolean;
```

Mark the twelve `hubOnly: true`, add one new item for the hub itself, and let
the sidebar filter. Everything else about the list stays as it is.

### 3c. The highlight logic is in JACKDAW, and it will double-light

`client/web/components/layout/sidebar-nav.tsx:74`:

```ts
const isActive = (item: NavItem) => navItemMatches(item, pathname);
```

That runs **per item, independently**. `navItemMatches` on a non-exact
`/settings` item matches `/settings` *and* everything under it — so on
`/settings/agents` both "Settings" and "Agents" would light up.

Three ways out, in preference order:

1. **Best: switch `isActive` to most-specific-wins** and leave `/settings`
   non-exact. `matchNavItem` already does exactly this, and its own doc comment
   anticipates this case — *"most specific href wins, so /settings/agents beats
   a hypothetical /settings"*. It stops being hypothetical. Then
   `/settings/profile` lights **Settings** (right — it is inside the hub) and
   `/settings/agents` lights **Agents** (right — it has its own entry).
   ⚠ This edit is in **jackdaw**, and it should land in the same release window
   as the mantle bump.
2. `exact: true` on the new item. One-line, mantle-only — but then browsing any
   hub screen lights nothing at all, and the sidebar goes blank exactly where
   the user is.
3. Do nothing and accept two lit rows. Don't.

---

## 4. The edit

### In mantle — `src/nav-items.ts`

Add `hubOnly` to the `NavItem` type (§3b), then in the Settings group:

**Add**, at the top of `items`:

```ts
{ name: 'Settings', href: '/settings', icon: Settings },
```

⚠ `Settings` the icon is currently used by the **Accounts** item
(`{ name: 'Accounts', href: '/settings/accounts', icon: Settings }`). Give
Accounts something of its own — `Mail` or `AtSign` fits what it actually is (mail
accounts) — rather than having two rows wear the same glyph.

**Mark `hubOnly: true`** on exactly these twelve:

```
Appearance · Microsoft · Calendars · Profile · MCP · Embedding
Local network · Entities · PDF passwords · Backups · Updates · Audit log
```

**Leave alone** the other twelve (Accounts, API keys, Agents, AI workers, Worker
groups, Tools, Tool groups, Skills, Config, Heartbeats, Peers, Logins) — they
are the collection screens and are not in the hub.

The sidebar then shows **13 Settings rows instead of 24**.

**Update `defaultHead`.** It is matched by href, so entries naming a now-hidden
screen are silently inert — they look like they work and never fire:

```ts
// before
defaultHead: [
  '/settings/accounts', '/settings/profile', '/settings/appearance',
  '/settings/agents', '/settings/keys',
],
// after — profile and appearance are inside the hub now
defaultHead: [
  '/settings', '/settings/accounts', '/settings/agents',
  '/settings/keys', '/settings/tools',
],
```

`headSize: 5` can stay. With 13 items the fold still earns its keep.

### In jackdaw — two small changes, same release window

1. `components/layout/sidebar-nav.tsx:67` — filter `hubOnly` out of the mapped
   `groups`. Doing it there rather than at render also fixes the head, because
   `useGroupHead(group)` is handed that same filtered group (`sidebar-nav.tsx:251`).
2. `components/layout/sidebar-nav.tsx:74` — `isActive` via most-specific-wins
   (§3c).

---

## 5. Release mechanics

`@mantle/share-ui` is an **exact pinned alias** in two places:

```
client/web/package.json:24        "@mantle/share-ui": "npm:@crossworks/share-ui@0.230.67"
packages/web-ui/package.json:176  "@mantle/share-ui": "npm:@crossworks/share-ui@0.230.67"
```

So nothing arrives automatically. The sequence is: land in mantle → publish
`@crossworks/share-ui` → bump **both** pins in jackdaw → `pnpm install` → land
the two jackdaw edits from §4 in the same commit as the bump, or the sidebar
double-lights between the two.

`@mantle/client-types` is pinned to the same version in both files and is
usually bumped in step; check whether the release moves it too.

---

## 6. How to check it worked

The hub's own specs already pass and must keep passing
(`e2e/specs/settings-hub.spec.ts`, 5 tests). Beyond those:

- **Sidebar**: Settings group shows 13 rows, not 24. The twelve hub screens are
  gone from it. Collection screens are all still there.
- **⌘K**: type "backups", "audit", "pdf" — each still offers the screen. This is
  the check that catches a delete-instead-of-hide.
- **Highlight**: `/settings/profile` lights **Settings** and nothing else;
  `/settings/agents` lights **Agents** and nothing else. Two lit rows is the bug
  §3c describes.
- **Cold start**: clear `localStorage.mantle_nav_usage_v1`, reload, and the
  Settings head should be the five new `defaultHead` hrefs in order. A stale
  entry shows up as a head that is short by one, silently.
- **Deep links**: `/settings/network/connect` still resolves and still lights
  Local network's hub card.

Environment and suite commands are in
[`handover-settings-endgame.md`](./handover-settings-endgame.md) §5. ⚠ The brain
does not survive the ssh that starts it, and check which worktree is serving
`:3100`.

---

## 7. What NOT to do

- **Do not delete the twelve items.** §3b. Hide them.
- **Do not move the collection screens into the hub** to make the group smaller.
  A list inside a list is the thing the route group exists to prevent.
- **Do not remove the `security` stub.** It is a 14-line redirect to
  `/settings/users`, has no nav entry, and exists for old bookmarks.
- **Do not touch `/settings/<name>` URLs.** The hub is a route group precisely
  so every one of them still works.
