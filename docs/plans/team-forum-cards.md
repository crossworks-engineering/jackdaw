# Plan: the Forum becomes a card list on the scaffold (2026-08-19)

**Asked for by Jason.** Four things, in his words:

1. the owner pages' **cards list menu** and content-page style guide;
2. a **draggable menu rail** on the left, and a **draggable, resizable card
   list** to its right;
3. the **forum list as cards with pagination** — topic, who posted last, what is
   new to the reader, and an **accent border** to mark a card that wants
   attention;
4. clicking a card **opens the forum inline and keeps the list open**;
5. forum **output** to match, where it makes sense, the owner agent's ability to
   show useful inline content.

This plan is written against [`ui-style-guide.md`](../ui-style-guide.md) §8 and
[`audit-team-portal.md`](../audit-team-portal.md), and it closes that audit's
§11 open item — the rail decision it said "wants a decision from you". Item 2
above **is** that decision: the rail drags.

---

## 0. Where the Forum stands today

| piece | today | wanted |
|---|---|---|
| the list | centred `max-w-4xl` column of bare `<Link>` rows with bottom borders — [`topic-list-client.tsx:390`](../../client/web/components/team-forum/topic-list-client.tsx#L390) | `<ListCard>` cards in a `<MasterDetail>` list pane |
| opening a topic | `router.push('/team/forum/<id>')` — a **route change**, list unmounts | inline detail pane, list stays mounted |
| the rail | fixed width, no handle — [`team-workspace-shell.tsx`](../../client/web/components/team-workspace/team-workspace-shell.tsx) | `<RailHandle>`, persisted width, collapse |
| pagination | already `<ListPager>`, already URL-driven (`?q`, `?sort`, `?page`) | unchanged — it is already right |
| the data | `unread`, `pinned`, `status`, `lastPostAuthor`, `lastPostPreview` all already returned by `GET /api/team/forum/topics` | unchanged — **no server work for the card** |
| agent output | bare `<ReactMarkdown remarkGfm>` + the `media:` image override — [`topic-view-client.tsx:104`](../../client/web/components/team-forum/topic-view-client.tsx#L104) | the useful subset of the owner dialect |

**The good news is how little is new.** The list already reads its state from
the URL, already pages, already returns every field a card wants. What changes
is the SHAPE, not the data.

The Forum is the last `/team` screen still off the scaffold: `team-section`
(Notes, Pages, Tables, Draw, Apps, Tasks, Events, Files) went over to
`<MasterDetail>` on 2026-08-19.

---

## 1. The rail drags (audit §1's open decision, answered)

`<RailHandle>` (`@mantle/web-ui/ui/rail-handle`), the same grip the owner rail
draws — `h-4 w-3`, bordered, `bg-border`, a `size-2.5` `GripVerticalIcon`,
**drawn at rest**, straddling the rail's edge. Style guide §8: *"every draggable
edge shows a grip, at rest, without hovering it."*

Three sub-decisions, and one is not a free port:

- **Collapse on ⌘B**, mirroring the owner shell. A collapsed rail has **no
  handle** — the toggle owns that width.
- **Publish `--nav-w`** on the shell root with `data-nav-collapsed`, so anything
  that later frames against the rail has a variable to read instead of a
  hardcoded width. Nothing reads it on `/team` yet; publish it anyway, because
  the audit's finding was that hardcoding is what caused the drift.
- ⚠ **Persistence is the one place `/team` cannot copy the owner.** The owner
  rail saves to a **cookie**, seeded server-side in `app/(app)/layout.tsx`, so
  the rail does not jump on load. `/team` is a client-fetch surface on purpose —
  no server DB reads, detached-dev safe — so there is no server render to seed
  from. **Use `localStorage` and accept one frame of default width**, or seed
  from the same cookie without a server read by writing it client-side and
  reading it in the layout. Pick the first; the second buys a few milliseconds
  for a cookie the member surface otherwise has no reason to own.

⚠ **Do not put a CSS transition on a width read from a variable** — the element
stops tracking the variable entirely. Animate the variable.

---

## 2. The list pane goes on `<MasterDetail>`

```tsx
<MasterDetail id="team-forum" list={…} detail={…} maxDetailSize="100%" />
```

- **Three panels, the default.** A forum thread is **prose the reader READS**,
  which the guide is explicit about: it wants a measure *and* a right edge.
  `detailFills` is wrong here — it leaves the thread no right edge, so widening
  the list is the only drag that does anything and the thread sprawls to the
  window. `/pages` shipped that and it was wrong.
- **Open the detail wider than 672px** (≈900px) with `maxDetailSize="100%"`, so
  the ceiling is the window and the opening measure is still readable.
- **`id="team-forum"`** is the persistence key. Unique per screen and per view.
- ⚠ **Size the nodes passed to `list` / `detail` with `h-full`, never
  `flex-1`.** The pane wrappers are blocks, so a flex property on your node is
  inert and every `h-full` descendant below it collapses. This is silent — the
  screen looks fine until the thread wants real height, which it will.
- **Both panes `min-h-0`, detail `relative`, `scrollbar-thin` on both.** The
  scaffold owns these; that is the reason to use it.
- Below `md` it falls back to a CSS grid and nothing resizes. On a phone the
  list and the thread stack — list first, thread with a back link, the same
  trade `team-section` makes.

**Controls above the list, pager below.** Search, the sort dropdown and "New
topic" sit in the list pane's header; `<ListPager>` pins to its foot. That is
already what the screen has — it moves from the centred column into the pane.
Rules span the pane's full width; only what sits between them insets by `p-6`.

⚠ **The screen was centred, so it has no padding of its own.** `mx-auto
max-w-4xl` was supplying the gap for free. The moment the cap goes, content sits
flush against the divider. Check the inset after removing the cap — do not
assume it was there. Three settings screens were caught by exactly this.

---

## 3. The card

Compose from `<ListCard>`'s **own parts** — `ListCardTitle`, `ListCardSnippet`,
`ListCardMeta`, `ListCardTags`. Never hand-write the inside. Thirty screens did
that once and `truncate text-sm font-medium` lost its `truncate` on one of them
and its `text-sm` on another.

```
┌──────────────────────────────────────────────┐
│ ● Title of the topic            🔒 📌 ○Kind  │  ListCardTitle + flags
│ Ashley: the LVC chart you asked about is…    │  ListCardSnippet (last post)
│ Ashley · 12 posts · 4h                       │  ListCardMeta
└──────────────────────────────────────────────┘
```

- **Title** — `ListCardTitle`. Not `wrap`: unlike `/pages`, finding a topic by
  an exact name past the ellipsis is not what this list is for.
- **What is new** — the `unread` count. Keep the filled `bg-primary` dot before
  the title, and give it an `aria-label` carrying the count (it already does).
- **Who posted last** — `ListCardSnippet` holds `lastPostAuthor: lastPostPreview`,
  clamped to two lines. `ListCardMeta` holds `authorName · N posts · timeAgo`.
- **Kind and flags** — the existing `<KindBadge>` and `<TopicFlags>` atoms from
  `@mantle/web-ui/forum-meta`, unchanged. Kind colours are chart-token **dots**
  beside muted text, never fills: chart tokens have no `-foreground` pair, so a
  filled badge cannot guarantee contrast across ~40 themes.

### 3a. The accent border — a new `ListCard` prop, not a class

Jason asked for *"nice border like we do in other owner pages to alert or mark a
certain item card."* Two constraints decide the shape:

1. **Selection already owns `border-primary` + `ring-1 ring-primary`.** An alert
   marker that also paints the whole border is indistinguishable from selection,
   and worse, ambiguous when a card is both.
2. The guide already has the marker idiom: the **slim `border-l-[3px]` accent
   bar** used by compact nav rows, where a full ring is too heavy.

So: **add an `accent` prop to `<ListCard>`** in `packages/web-ui/src/ui/list-card.tsx`,
painting a `border-l-[3px]` in a semantic token, and leave the ring to
selection. It goes on the primitive and not in the Forum, for the same reason
the anatomy parts exist — a class typed into one screen is a class that drifts.

Which tokens, and the whole point is that they are semantic and not decorative:

| the card is | token |
|---|---|
| pinned / an owner announcement | `primary` |
| unread since the member last read it | `info` |
| a `bug` topic still open | `warning` |
| answered / closed | none — `dimmed` already says it |

⚠ **A fill is not an ink, and `chart-1..5` is DATA ink.** Status colour comes
from `success` / `warning` / `info`, never from a chart token and never from a
literal green or red. The border uses the fill token (`border-info`), which is
correct — it is a line, not text.

**One marker per card, most urgent wins.** Two accent bars is not a marker, it
is a gradient.

---

## 4. Clicking a card opens the thread beside it

**Selection is URL-driven**, matching `team-section`: `?t=<topicId>` beside the
existing `?q` / `?sort` / `?page`. The cards become `<ListCard asChild><Link>`
rows, so middle-click and copy-link keep working, and the whole view stays
linkable and refresh-safe.

This is the change that makes the ask real: **the list stays mounted**, so its
search text, scroll position and page survive opening a topic — today they are
destroyed by the route change.

- **`TopicViewClient` becomes embeddable.** It already takes `topicId` as a
  prop, so the work is removing the assumptions that it owns the screen: its own
  page padding, its back link and its full-height wrapper move out to the caller.
- **Keep `/team/forum/[id]` alive as a deep link.** Style guide §8: deep-link
  pages keep working after a master-detail supersedes the in-app navigation,
  because other screens (and the agent's own links, and notification mail) point
  at them. It renders the same client, wrapped in a `<MeasurePane>` rather than
  the scaffold.
- **Auto-select the first topic** so the right pane is never blank.
- `?turn=<id>` still has to reach the view — a topic created from the dialog
  attaches to its live turn instead of waiting for a refetch. It rides along
  beside `?t=`.
- **`listCollapsed` is available but not for v1.** Focus mode on the Forum means
  reading one long thread, which is a real want; it is separable work and the
  list must stay MOUNTED when it collapses (`{zen ? null : list}` looks identical
  and quietly makes focus mode a reset button).

---

## 5. The agent's output: what "matching owner capabilities" means here

⚠ **This item reopens a decision that was taken deliberately**, so it needs
saying plainly before any code. Both member renderers are bare
`<ReactMarkdown remarkGfm>` **on purpose** — *"members get standard-Markdown
replies (no TipTap rich dialect)"* — and
[`handover-team-agent-images.md`](../handover-team-agent-images.md) §6 lists
*"do not port TipTap to the member surfaces"* under **What NOT to do**.

The reason is not laziness: `lib/rich-markdown.ts` brings the entire Pages
schema with it — callouts, columns, mentions, the page node set — and with it a
much larger surface of things the member renderer can be asked to draw.

**The proposal is to keep that ban and close the gap the other way**: add
`components.*` overrides and small remark plugins for the constructs that carry
information a member needs, leaving the schema out. What the owner dialect has,
and the call on each:

| owner construct | member surface | call |
|---|---|---|
| tables, lists, code, headings | **already works** (`remarkGfm`) | — |
| an inline `media:` picture marker | **already works** (v0.4.1) | — |
| callouts `:::info` … | renders as raw `:::` text | **add** — a warning in a safety answer is content, not decoration |
| task lists `- [ ]` | renders as GFM checkboxes already | verify only |
| `==highlight==`, `[x]{color=}` | renders raw | **add highlight**, skip colour — colour alone carries no meaning to a reader who cannot see it |
| columns `:::columns` | renders raw | **skip** — a two-column layout in a 900px thread pane is worse than one column |
| drawings `draw:<id>` | broken | **add** — same shape as `media:`, same route question |
| page / node mentions | renders as a link or raw | **add as a plain link** to the share, never as a chip |

⚠ **Every new marker that resolves to bytes needs the same authorization
question the image route answered**: *is this node attached to a post in a topic
this member can see?* — answered from the post's own `attachments` column, not
from the file tree, or the authorization becomes "any file the responder ever
touched". Uniform **404**, never 403, so a member cannot probe which ids exist.
`GET /api/team/forum/media/[nodeId]` and `server/web/lib/team-media.ts` are the
precedent; a drawing route is a sibling of it, not a new pattern.

⚠ **An `<img>` tag cannot carry the member's credential.** The routes take a
cookie or a localStorage bearer, and a tag can only send the cookie — so a plain
`<img src=…>` works same-origin and 401s on a split box. `AgentImage` already
fetches through `teamFetch` and renders an object URL. Anything new that loads
bytes goes through the same door.

**And the thing that actually blocks pictures on the customer brain is still not code.**
`team-responder` holds two tool groups (`team-read`, `formulas-eval`);
`show_image` lives in `files`, which is not granted. Until that grant lands
nothing in this section changes what a member sees. Jason chose to grant the
whole `files` group; that hands a member-facing responder `file_read` over the
owner's entire store plus `file_create` / `file_rename` / `folder_rename`, and
the narrowing to a `show_image` + `file_get` group is one line. Worth
re-confirming before the grant, not after.

---

## Order of work

Each step ships on its own. The numbering is dependency, not priority.

1. **§1 the rail** — self-contained, and it is the audit's open decision. Do it
   first so the scaffold in §2 does not land beside a rail that is about to
   change.
2. **§3a the `ListCard` accent prop** — one primitive, no screen behaviour. It
   lands before §3 so the Forum consumes it rather than inventing a class.
3. **§2 + §3 + §4 together** — the scaffold, the card and inline opening are one
   change; splitting them ships a screen that is half-ported.
4. **§5 the renderer** — separable, and paced by the customer's tool grant it is
   waiting on anyway.

## Verify

- The rail drags, the width survives a reload, ⌘B collapses it, and the
  collapsed rail has no handle.
- The list divider drags; the width survives a reload under `id="team-forum"`.
- Opening a topic leaves the list mounted — **type a search, open a topic, and
  the search text is still there**. That is the acceptance test for the whole ask.
- `/team/forum/<id>` still opens standalone.
- A pinned topic and an unread topic draw ONE accent bar each, and a selected
  card still reads as selected.
- ⚠ **Wait for a resize handle before touching the list in any e2e.**
  `MasterDetail` paints a CSS grid until `useMediaQuery` resolves and then swaps
  to panels — a different tree, so the list subtree is rebuilt once on mount.
  A test that measures before that swap is racing a remount: green alone, red
  under a full run. The handle exists only in the panel branch, so it is the
  settled signal. It has already cost more than one debugging cycle.
- Nothing here can be exercised without a real member token. The audit's §11
  note stands: `/team` wants a pass against a live brain.

---

## Addendum — the drag range (2026-08-19)

Jason, after reading the plan: *"on forums, must be able to drag smaller and
larger up to max size."*

`<MasterDetail>`'s defaults are tuned for a settings form — a 340px list of one-
line rows beside a 672px form, ceiling 1100px. Both ends are too tight here. A
forum card carries a title, a two-line last-post snippet and a meta line, and a
thread is the thing the screen exists to read. So state all six sizes rather
than inheriting any:

| prop | value | why |
|---|---|---|
| `minListSize` | `220px` | the card still reads: title truncates, snippet clamps |
| `defaultListSize` | `360px` | a touch over the 340px default, for the snippet line |
| `maxListSize` | `720px` | up from 560px — a member scanning "what is new" wants a wide list, and the snippet is the reason |
| `minDetailSize` | `420px` | the scaffold default; below it a thread stops being readable |
| `defaultDetailSize` | `900px` | opens readable, same measure `/pages` chose |
| `maxDetailSize` | `100%` | **this is the "up to max size"** — the drag runs the empty spacer to zero, so the ceiling becomes the window minus the rails instead of a hardcoded 1100px |

⚠ **`minListSize` must be ≤ `defaultListSize`.** `/apps/[id]` had to bring its
floor down to 160 for exactly this: leave the 260px default under a smaller
opening width and the minimum sits ABOVE the default, so the divider can only
ever travel one way. 220 ≤ 360 holds.

⚠ **Do NOT pass `listCollapsed` to get a smaller floor.** Passing it at all is
what makes the panel collapsible, and `collapsible` also means *"collapse when
dragged below `minSize`"* — so the member could drag the list out of existence,
which contradicts the requirement one paragraph up that the list stays open.
`minListSize` is the floor; that is the whole job. Focus mode stays separable
work (§4).

**The mobile fallback ignores all of this.** Below `md` the scaffold paints a
CSS grid from `defaultListSize` / `defaultDetailSize` and nothing resizes. The
min and max only exist in the panel branch.

---

## §5 revised — Jason's call, and the route it opens (2026-08-19)

Jason: *"pages can be shared with images, charts etc, that is what is valuable
for the team… if it can show as a public page with all of this then it certainly
can be read for members, these are trusted people."*

**The premise checks out, and it is stronger than stated.** `/team` does not
merely *could* render rich content — it **already does**.
[`share-reader.tsx`](../../client/web/components/team-workspace/share-reader.tsx)
fetches `GET /s/<token>/view` and mounts *the same presenters the `/s` surface
renders*: `NotePresenter`, `DrawPresenter`, `TablePresenter`, `FormulaPresenter`,
`FilePresenter`, `AppSandbox`, and pages as server-rendered sanitized HTML with
an outline. Two screens already consume it — `team-section` (every /team section)
and `team-hub-client`.

So the "members get plain markdown" line was never a policy about **what a member
may see**. It is a fact about **one renderer** — the chat/forum reply body — and
that renderer is now the only part of `/team` that cannot show a chart.

⚠ **What the trust argument settles, and what it does not.** It settles the
rendering question completely: no more debating whether a member should see a
chart. It does **not** settle the byte-authorization question, and the two are
easy to conflate. A share token authorizes its own assets — that is what makes
`/s/<token>/a/<fileId>` safe. An agent-authored marker inside a forum post rides
**no token**, so it still needs its own answer to *is this node attached to a
post in a topic this member can see?*, still from the post's `attachments`
column, still a uniform 404. Trusted people are not the same as an unauthenticated
URL. That rule is unchanged by this decision.

### The route this opens, and it is better than porting TipTap

The valuable content Jason is describing — images, charts, tables — is **page
content**. Pages already have a renderer on this surface. So the shape is:

**The agent writes rich output to a page, shares it to the team, and the forum
mounts `<ShareReader>` inline in the post.**

That is a third reuse of a component two screens already run, not a new
capability, and it lands the whole ask:

| what it gives | how |
|---|---|
| images, charts, tables, drawings, formulas, apps | the presenters, unchanged |
| authorization | the share token, unchanged — the door that already exists |
| server-side sanitisation of page HTML | `renderPageDoc`, unchanged |
| a durable artefact the team can find later | it is a page, not a buried reply |

**And it beats a TipTap port on the merits**, not just on effort: a rich reply is
a thing said once in a thread; a shared page is a thing the team keeps. Jason's
own words — *"that is what is valuable for the team"* — describe an artefact,
not a message.

### So, three pieces of work, in order

1. **Forum renders a team share inline.** A post body carrying a `/s/<token>`
   link (or a `page:` marker resolving to one) mounts `<ShareReader>` instead of
   a bare anchor. Client-side only; no new route, no new authorization.
2. **The responder can make and share one.** `team-responder` holds
   `team-read` + `formulas-eval` today, so it can neither create a page nor
   share it. This needs a grant, and it is a **bigger** grant than the images
   one — a member-facing agent that can publish to the team. It wants its own
   narrow group, not `curation` + `sharing` + `page-share` wholesale.
3. **The small markdown adds still stand** — callouts and `==highlight==`, per
   the original §5 table. They cost little and carry meaning a link cannot.

**Still no TipTap port.** The ban survives, but for a better reason than before:
not "members get less", but "the rich renderer is the share surface, and it is
already here".

⚠ **The `files` grant question from §5 is now two questions, not one.** Images
in a reply need `show_image` (Jason chose the whole `files` group; the narrow
version is `show_image` + `file_get`). Publishing a page needs a *separate*
grant. Decide them separately — they have different blast radii and neither
implies the other.
