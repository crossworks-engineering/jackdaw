# Handover: the agent sees what the user sees (2026-08-20)

**For the next session.** Make the assistant aware of what is on screen — the open
item and the screen itself — and then delete the Highlight picker it replaces.

Jason, 2026-08-20:

> What the user sees the agent should also see — an id or jsonb object or just the
> data where needed, does not matter where the user is looking. I know this already
> happens in many cases but it needs refinement and also the removal of the
> highlight content, it is not used and probably won't be popular.

> If for example a page is open, the user should see the linked page at the top of
> assistant chat and should have the option to remove it if it is not context the
> user wants the assistant to be aware of. The selector does work for this, but I
> have a feeling it will not be used, an automatic link is probably the answer.

## The tasks this implements

All on the dev brain, tagged `mantle-roadmap`. Read them — they hold the decision
history and the rationale this doc only summarises.

| id | title | role |
|---|---|---|
| `1b2894d5` | Give the agent the focused/open item as context | the item half — **start here** |
| `302fa8d2` | Screen-aware agent — "what is this screen?" | the screen half, same payload |
| `f178c263` | Rework the picker tool | the Highlight removal — **goes last** |
| `c2d47a13` | Operational surfaces (Runners, Traces, Runs) | a later phase, different resolver |

---

## §1 Rule zero — most of this is BUILT. Do not redesign it

Two sessions in a row have started this work by proposing a mechanism that already
exists. Read this section before writing any code.

**`client/web/components/assistant/use-surface-assist.ts` is the mechanism.** It
already pins the open node so it rides every turn, folds in a focus directive,
publishes the in-node selection as composer chips, publishes the pending
draft-change count, refreshes the editor when a turn editing that node settles, and
tears it all down on unmount. It is good. Read it first.

**The removable chip Jason asked for is already built**, at
`app/(app)/assistant/assistant-client.tsx:1650-1686`:

- the pinned ref renders **first**, `MapPin` glyph, `border-primary/40 bg-primary/10`
  — visually distinct from a manually picked chip;
- tooltip: *"On this screen — sent with every message. Remove to ask a general
  question."*;
- an `X` at `:1677` calling `dismissPinnedContext(c.id)`, labelled *"Remove from this
  chat"*;
- `assistant-thread-client.tsx:156` shows the pinned label on the full-page thread.

The dismiss path is real state — `pinnedDismissedIds` in the dock provider, filtered
out of `pinnedContext`. Not decoration.

**It is invisible today only because three screens pin.** That is the whole job:
rollout, not design.

⚠ Stale comment to fix in passing: the block comment above `:1650` says the pinned
chip shows *"with a pin glyph and no remove"*. It renders a remove.

---

## §2 The measured picture (jackdaw v0.5.0, 2026-08-20)

### Coverage — and why the deletion order matters

| mechanism | screens | which |
|---|---|---|
| `useSurfaceAssist` (the automatic link) | **3** | `pages/[id]`, `tables/[id]`, `apps/[id]` |
| Pick mode (Highlight), via `data-mark-id` | **10** | pages, notes, tables, tasks list, tasks board, events, files, journal, draw, formulas |

They barely overlap: Highlight is on the **list** screens, focus is on the **detail**
routes. **Delete Highlight before the rollout and seven screens lose their only way to
hand the agent anything.** This is the single most important constraint in this doc.

### Three live bugs, all in the thing being replaced

1. **Unknown kinds silently become `'file'`.** Screens emit `data-mark-kind="draw"`
   and `"formula"`; neither is a `ContextKind`. `pick-mode.tsx:48`:

   ```ts
   kind: kind && KINDS.has(kind) ? (kind as ContextKind) : 'file',
   ```

   So marking a drawing tells the agent "this is a file" — wrong kind, wrong preamble.

2. **Pick mode has no visual affordance at all.** `pick-mode.tsx:33` sets
   `document.body.dataset.picking = 'true'`, and its own comment says *"The highlight
   itself is pure CSS, keyed off `body[data-picking]` (globals.css)"* — but **no CSS
   anywhere in the repo targets `body[data-picking]`**. Grep it. The mode turns on and
   nothing looks any different, so there is no way to tell what is markable. This is
   most of "nobody reaches for it".

3. **`/inbox` emits no `data-mark-id` at any depth.** Jason's "wanting to mark an
   email did not work" was never a bug — there was nothing on that screen to mark. No
   fix to pick mode could have made it work.

### Drift already present

`pick-mode.tsx`'s local `KINDS` set has 8 entries where `ContextKind` has 9 (it omits
`'app'`). Two sources of truth for the same list, already disagreeing.

---

## §3 Settled — do not reopen

Decided by Jason 2026-08-19 and 2026-08-20. Full rationale lives in the tasks.

1. **Registry ownership: SPLIT.** Jackdaw owns route → descriptor; mantle keeps topic
   slug → markdown. ⚠ The cross-repo "every topic has a content file" CI guarantee
   cannot survive this — **the brain must degrade on an unknown slug, never error.**
2. **Delivery: HYBRID.** A small block rides every turn; heavy content is pulled only
   when the question warrants it.
3. **Uncovered screens: SEND ANYWAY** — route + params beats silence.
4. **Item ref: typed union `{ kind, id }`, resolved brain-side**, owner-scoped. The
   surface owns the id; the mail DTO stays untouched.
5. **Focus/open based, not selection based.**
6. **An `email` ref means the THREAD** — "replying means the whole conversation".
   See §4a, which changes how this is built.

---

## §4 The plan

### Phase 0 — the contract (small, unblocks everything)

**Jackdaw.**

- Extend `ContextKind` (`components/assistant/assistant-dock.tsx:79`) by four:
  `draw`, `formula`, `email`, `contact`. The task only names three — `formula` is a
  fourth, found by measuring what the screens actually emit.
- Make `pick-mode.tsx`'s `KINDS` **derive from the union** rather than restate it, so
  they cannot drift again. (It dies in phase 3, but until then it should be correct.)
- Add `meta` to the ref:

  ```ts
  { kind: ContextKind, id: string, label: string, meta?: Record<string, string> }
  ```

  Cheap identifying data that is NOT a node lookup. Two known consumers on day one:
  a file's folder path, a table's active tab.

**Mantle.**

- Add the owner-scoped resolver, roughly
  `resolveContextRef(ownerId, ref) → nodeId | null`.
  - Identity for `page/note/table/journal/task/event/app/file/folder/draw/formula` —
    keep that path free of a round trip.
  - One hop for `email`: `emails.id → emails.node_id`.
  - **Owner-scope every lookup.** `id` now arrives from the client and can be any
    uuid; an unscoped lookup here is a cross-owner read.
  - **Unresolvable refs degrade, never throw.** A stale id after a delete is normal.
- Document at the type that **`id` is kind-relative**. This is the union's one
  footgun: pass a node id for `email` and it resolves to nothing, silently.

#### §4a Email: the decision is the thread, but there is no thread node

Jason settled this as "the thread". Verified in mantle the same day: **`email_thread`
is a declared node type that nothing creates.** `packages/db/src/schema/nodes.ts:23`
declares it; every other reference is a read/filter site (`extractor.ts:136,894`,
`builtins.ts`, `build-server.ts`, `search-query.ts`, `journey-format.ts`, one test).
There is no `email_threads` table and no insert anywhere.

So resolve to the **message node** and carry the thread key in `meta`:

1. `emails.id → emails.node_id` — a real node the agent's node tools can read;
2. `meta: { threadId, accountId }` — `emails.threadId`
   (`packages/db/src/schema/emails.ts:153`) is the provider's thread key, indexed at
   `:198` (`emails_thread_idx`);
3. give the agent a way to pull the conversation — `where account_id = ? and
   thread_id = ?`, owner-scoped, one indexed query.

⚠ **`threadId` is nullable** (IMAP without threading headers, historical rows). Fall
back to the single message, silently.

Populating `email_thread` at ingest is a much larger change — ingest, embeddings,
search filters, shares — and is **not** required here. Do not make this depend on it.

> Worth confirming against a brain with live IMAP before building: the "nothing
> creates `email_thread`" finding is from an exhaustive repo grep, but the dev brain
> has no `email` nodes at all, so it could not corroborate.

### Phase 1 — roll `useSurfaceAssist` out (the bulk; labour, not design)

Wire the hook into every screen that has an open item and does not pin one. Audit the
list, do not guess it — but it is at least: notes, journal, events, tasks, files,
formulas, draw, contacts, inbox. Tables additionally needs the **active tab** in
`meta`.

The removable chip appears on each screen for free as soon as it pins. That is the
user-visible payoff of the whole handover, and it arrives incrementally — ship per
screen rather than in one commit.

### Phase 2 — the screen descriptor (task `302fa8d2`)

- Extend the registry entry from a bare slug to a descriptor: topic slug + which
  params carry meaning + a one-line "what this screen is for" the agent can cite.
- One `context` block per turn carrying **both** halves. Do not build two mechanisms.
- ⚠ **Define `meta` and "meaningful params" together.** A table's active tab could
  arrive as a route param or as ref `meta`; it must not arrive as both.
- 29 of 98 routes have no topic — all twelve `/debug/*`, the whole `/team/*` shell,
  `/settings/security`, `/changelog`, `/hub`, `/onboarding`, `/login`. Filling them is
  labour, not a decision.

### Phase 3 — delete Highlight (task `f178c263`)

Only once phase 1 has actually replaced it. Bigger than the button:

- `components/layout/rail/rail-toolbar.tsx:70` — drop `<HighlightButton />`. Its doc
  comment describes "four controls" and will need updating.
- `components/assistant/assistant-dock.tsx` — `HighlightButton` and the pick half of
  the dock state (`picking`, `startPicking`/`stopPicking`, `pendingContext`,
  `attachContext`, `removeContext`, `clearContext`).
- `components/assistant/pick-mode.tsx` — delete the file.
- `components/app-shell.tsx:562` — drop `<PickMode />`.
- The ten screens in §2 — `data-mark-id` / `data-mark-kind` / `data-mark-label`.
- `components/help/help-launcher.tsx:10` — a comment positions the launcher "left of
  Highlight content".
- No CSS to remove: the `body[data-picking]` rules the code refers to do not exist.

⚠ **The composer chip is SHARED.** `assistant-client.tsx:1653` branches on `pinned`
to decide chip styling and whether `X` dismisses or removes. The **picked branch**
goes; the chip stays.

---

## §5 Open — needs Jason

- **Does a manual pick have any residual case** focus cannot serve — marking
  something on a screen you are *not* standing on, or two things at once? Jason's read
  is no. If that holds, delete outright rather than demoting Highlight to a fallback,
  which is what `f178c263`'s original direction proposed. **Decide after living with
  the phase 1 rollout**, not before.
- **What is "the open item" when the desktop shell has several windows open?** Named
  in `1b2894d5` and still unanswered. Does not block phases 0–2.

## §6 Verify before you trust this doc

Everything here was measured on 2026-08-20 against jackdaw `v0.5.0` and mantle
`v0.232.0`, but line numbers move. Re-run these:

```sh
grep -rln "useSurfaceAssist(" client/web/app        # expect 3 before phase 1
grep -rln "data-mark-id" client/web/app             # expect 10 before phase 3
grep -rn "export type ContextKind" -A2 client/web/components/assistant/assistant-dock.tsx
grep -rn "data-picking" --include=*.css .           # expect NOTHING — the bug in §2.2
```
