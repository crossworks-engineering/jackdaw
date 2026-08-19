# Handover: the team responder cannot show a picture (2026-08-19)

> **STATUS — 2026-08-19, evening. DONE, VERIFIED LIVE.** §3 steps 1–3 shipped
> in mantle v0.230.69 and jackdaw v0.4.1; step 4 completed the same day —
> NATREF rolled (server v0.230.70, client v0.4.2), the `files` group granted
> to `team-responder`, and the LVC question re-asked in the original topic:
> **the chart renders inline in the forum thread.** §7 records what was built
> and the two things the plan did not anticipate.

**Reported by Jason**, from the NATREF forum: *"the system was unable to render
some images. Can we make sure our capabilities match the owner chat agent."*

It is not a rendering bug. The agent diagnosed itself correctly, in public, in
the topic **"How to Read an LVC Curve"** on 2026-08-19 12:47 UTC:

> the actual LVC chart images live in this brain's private file storage
> (extracted from the RBI status reports), and **I don't have a tool that mints
> a public image URL for them**. Markdown `![]()` only renders if I can point it
> at a raw, reachable image URL, and these don't have one

Ashley had asked twice. The first answer linked `/n/<id>` permalinks instead of
pictures; the second explained why and offered to file a request. The agent
behaved well. It is missing three things.

---

## 1. The three gaps

Fixing any one alone changes nothing a member can see.

### 1a. The tool is not granted (data, per brain)

Measured on NATREF, `agents.tool_group_slugs`:

| agent | groups |
|---|---|
| `assistant` (Rea) | 32 — `memory-core, files, notes, events, tasks, contacts, journal, recall, email, persona, media-workers, delegation, messaging, secrets, ingest, tool-results, page-share, location, profile, export, tables-import, app-data, team-admin, federation, curation, sharing, tables-read, tables-rows, pages-draft, formulas, calculator, draw-read` |
| `team-responder` | **2** — `team-read, formulas-eval` |

`show_image` lives in the **`files`** group:

```
folder_list, folder_get_by_path, file_list, file_get, file_read,
file_create, file_rename, folder_rename, folder_describe, show_image
```

### 1b. The runtime throws the picture away (mantle code)

`packages/assistant-runtime/src/run-turn.ts` mentions `artifact` **10 times**.
`run-team-turn.ts` and `run-forum-turn.ts` mention it **zero** times.

So even once granted, `show_image` would build a perfectly good `ToolArtifact`
and nothing would persist it. This is the exact bug the owner side already hit
and fixed — see the comment at `run-turn.ts:565`, *"an artifact not written here
is never rendered at all: `show_image` was building four perfectly good
artifacts a turn and landing an empty `attachments` column."*

✅ **The storage already exists.** `forum_posts.attachments` and
`team_messages.attachments` are both `jsonb`, defaulted, already in the schema.
No migration. The runners simply never write them.

### 1c. The member surfaces render plain markdown (jackdaw code)

| surface | renderer |
|---|---|
| owner assistant | `components/assistant/rich-text.tsx` → TipTap + `pageExtensions`, fed by `lib/rich-markdown.ts` |
| team chat | [`team-chat-client.tsx:187`](../client/web/components/team-chat/team-chat-client.tsx#L187) — bare `<ReactMarkdown remarkPlugins={[remarkGfm]}>` |
| forum | [`topic-view-client.tsx:104`](../client/web/components/team-forum/topic-view-client.tsx#L104) — the same bare render |

`lib/rich-markdown.ts` is what turns `![alt](media:<file-id>)` into a real
picture (`MEDIA_IMAGE_LINE_RE`, :225). The member surfaces never call it, so a
`media:` marker would render as a broken `<img src="media:…">`.

Both member renderers were deliberately light — the file comment says *"members
get standard-Markdown replies (no TipTap rich dialect)"*. That decision is what
is being revisited; say so in the commit.

---

## 2. ⚠ The decision taken, and what it costs

**Jason chose: grant the whole `files` group.** Recorded here because the
alternative was offered and declined, and because the exposure is not obvious
from the group's name.

The team-surface refusal (`ctx.surface?.kind === 'team' || 'forum'` →
`owner-side tool — not available on the team surfaces`) is **per-tool and
opt-in**. It exists on exactly four tools:

- `team_chat_list`, `team_chat_read`, `team_access_list` (`builtins-team.ts`)
- `content_supersede` (`builtins.ts:868`)

**No `files` tool carries it.** So the grant is literal: a member-facing
responder gets `file_read` over the owner's entire file store, plus
`file_create`, `file_rename` and `folder_rename` — writes. On NATREF that store
holds the RBI status reports the LVC charts were extracted from, and whatever
else Pinnacle has ingested.

If that is not intended, the narrowing is one line — a new tool group holding
`show_image` + `file_get` only, granted instead of `files`. Everything else in
this plan is unchanged.

---

## 3. The plan

### Step 1 — mantle: persist artifacts on the two member turns

Mirror `run-turn.ts:565–585` into `run-team-turn.ts` and `run-forum-turn.ts`:

- run `artifactsNotPlacedInline(artifacts, reply)` (`inline-images.ts`) so a
  picture the reply placed inline does not also appear in the strip below;
- keep only artifacts with a `nodeId` — the base64 never goes in the column;
- write them to `attachments` in `finalizeForumPost` / the team equivalent.

### Step 2 — mantle: a member-authorized route for the bytes

The owner strip fetches `/api/files/files/<nodeId>`, which is owner-authed. A
member holds a team token, so that route 401s. **Do not widen it.**

The precedent to copy is already there:
`server/web/app/api/team/forum/attachments/[blobId]/route.ts` — resolves the
caller with `resolveTeamChatCaller`, authorizes against the topic
(`getForumTopic`, absent == forbidden == uniform 404), rate-limits per contact,
serves with `safeDownloadHeaders` + Range.

An agent-produced image is a different object: it is a **file node**, not a
`forum_uploads` blob. So this needs a sibling route whose authorization asks a
different question — *is this node attached to a post in a topic this member can
see?* Answer it from the post's own `attachments` column, not from the file
tree, or the authorization becomes "any file the responder ever touched".

⚠ **This is the security-critical file in the change.** Everything else is
plumbing.

### Step 3 — jackdaw: render it

Two decisions, in order:

1. **The strip below the reply** — port the owner's `StoredAttachmentView`
   equivalent to both member surfaces, pointed at the step-2 route.
2. **Inline `media:<id>`** — give the member renderers a `components.img`
   override on `ReactMarkdown` that rewrites a `media:` src to the step-2 URL.
   A full TipTap port is NOT needed and should be resisted: the member dialect
   is standard Markdown on purpose, and `rich-markdown.ts` brings callouts,
   columns and the whole page schema with it.

### Step 4 — release and roll

mantle release, jackdaw release, then NATREF: `MANTLE_IMAGE_TAG` +
`MANTLE_CLIENT_IMAGE_TAG`, both stacks. See the roll journal
(`bada3bce-ff39-4e97-a509-a96e3ab35ff0` on the dev brain) — the client stack is
rolled SEPARATELY and a plain `compose up` silently skips it.

Then grant the group on NATREF (owner UI → Settings → Agents → Team Responder,
or `tool_group_slugs`), and re-ask the LVC question in the same topic.

---

## 4. Traps

1. ⚠ **`show_image` returns base64 for the live channel.** Only the `nodeId`
   belongs in the column. The owner code says so at `run-turn.ts:571`.
2. ⚠ **Uniform 404, never 403.** The forum attachment route returns 404 for
   "not allowed" so a member cannot probe which node ids exist. Match it.
3. **Dedupe or the picture renders twice** — once inline, once in the strip.
   `artifactsNotPlacedInline` exists for exactly this; use it, don't re-derive.
4. **The isolation invariants are tested.** `run-forum-turn.test.ts` and
   `run-team-turn.test.ts` assert no persona notes, no digests, no owner
   journal/identity, private reads stripped. Adding artifact handling must not
   disturb them — run both.
5. **Team chat's `attachments` column is unused today.** Writing it changes what
   `/api/team/messages` returns; check the member client tolerates the new field
   before the server ships.
6. **NATREF's team chat is dormant** — newest message 2026-07-17. The forum is
   the live surface (199 posts, active today). Test there.

---

## 5. Coverage

- A forum turn whose agent calls `show_image` persists a `nodeId` artifact and
  no base64.
- A reply that writes `![](media:<id>)` for the same file does NOT also get a
  strip entry.
- The member route serves a node attached to a post in a topic the member can
  see; returns **404** for a node in a topic they cannot, and for a node
  attached to no post at all.
- Team chat and the forum both render the strip, and both resolve an inline
  `media:` marker.
- `run-forum-turn.test.ts` / `run-team-turn.test.ts` isolation assertions still
  pass.

---

## 6. What NOT to do

- **Do not widen `/api/files/files/<nodeId>` to team tokens.** §3 step 2.
- **Do not port TipTap to the member surfaces.** §3 step 3.
- **Do not grant the remaining 30 owner groups.** The ask was images. `secrets`,
  `email`, `journal`, `persona`, `team-admin` and `federation` are on Rea for
  reasons that do not transfer to a member-facing responder.
- **Do not assume a tool is safe on the team surface because others are.** The
  refusal is opt-in per tool. §2.


---

## 7. What was built (2026-08-19)

**mantle v0.230.69** — `feat(team): let the member surfaces carry a picture`

- `durableAttachmentsFor` in `inline-images.ts`: the artifacts → column mapping,
  written ONCE. All three surfaces had to learn the same three steps and two of
  them had learned it as "not at all". The owner turn now calls it too; its
  behaviour is unchanged byte for byte.
- `finalizeForumPost` / `updateTeamMessageOutcome` accept `attachments`; both
  runners pass them. **No migration** — both columns already existed.
- `GET /api/team/forum/media/[nodeId]` and `/api/team/messages/media/[nodeId]`,
  over a shared `server/web/lib/team-media.ts`.
- Authorization helpers `forumTopicsWithAttachedNode` /
  `teamThreadHasAttachedNode` — jsonb containment against the POSTS, per §3.

**jackdaw v0.4.1** — `feat(team): draw the pictures the agent sends`

- `components/team-media.tsx`: `AgentImage`, `AgentMediaStrip`,
  `mediaMarkdownComponents`.
- `lib/team-media.ts` + tests: the pure addressing half, because jackdaw's suite
  has no React renderer.
- Both member surfaces take the `components.img` override and the strip. No
  TipTap, per §3 step 3.

### Two things the plan did not anticipate

1. ⚠ **An `<img>` tag cannot carry the member's credential.** The routes accept
   either the `mantle_team_chat` cookie or a localStorage bearer, and a tag can
   only ever send the cookie — so `<img src=…>` works same-origin and 401s on a
   split box. That is the same shape as the inline-share-reader limitation, and
   adding a second one would have been careless. `AgentImage` fetches through
   `teamFetch` and renders an object URL, which works on both; the URL is
   revoked on unmount.

2. **The agent's rows share `attachments` with member uploads.** A member upload
   carries `fileId`, an agent artifact carries `nodeId`, and both surfaces
   already rendered that array as paperclip chips. They now split on which id is
   present — without it a captioned artifact renders twice, once as a picture
   and once as a chip repeating the caption.

### Still not done

- **The tool grant.** Nothing changes on NATREF until `team-responder` gets a
  group containing `show_image`. Jason chose `files`; §2 is what that costs and
  the narrowing is still one line.
- **e2e.** Never run against any of this — it needs the hermetic local stack.
  The `media:` parsing is unit-tested (including that
  `media:../../api/files/files/secret` reads as "not a marker"); the routes are
  not, matching the attachment route they copy.
