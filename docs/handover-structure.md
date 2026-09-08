# Handover: the structure pass (planned 2026-09-08)

Structure is the last dimension of the 2026-09-07 frontend audit nobody has
touched. It scored **6.5** at v0.6.42 and scores 6.5 now, while every other
dimension has moved. This file is the plan for closing it, written to be picked
up cold.

The audit is the authority on the finding; this is the plan it does not carry.

- **Report**: <https://claude.ai/code/artifact/216dc6be-2285-424f-bc90-72ed7410942e>
- **The rollout so far**: `docs/handover-frontend-audit.md` — read its §5
  landmines before touching anything, they still apply.

---

## 1. The finding, and why it is worth a pass

The audit's words: _four screens between 2,100 and 2,500 lines with 15 to 31
`useState` each and no tests._ Re-measured at v0.6.61 (the counts below exclude
the import line, so they run one under the audit's):

| Screen                                | Lines | The one big component              | `useState` |
| ------------------------------------- | ----- | ---------------------------------- | ---------- |
| `settings/ai-workers/worker-form.tsx` | 2,507 | `WorkerForm`, 914 lines            | 25         |
| `assistant/assistant-client.tsx`      | 2,211 | `AssistantClient`, **1,783 lines** | 18         |
| `files/files-client.tsx`              | 2,158 | `FilesView`, 1,187 lines           | 30         |
| `settings/agents/agents-client.tsx`   | 2,147 | `AgentsClient`, 1,555 lines        | 14         |

9,023 lines in four files, and 16 files in the tree are over 800.

The cost is not aesthetic. It is that **none of these can be tested and none can
be reviewed.** A 1,783-line component with 23 `useRef` has no seam to assert
against, so every change to it is verified by clicking — which is exactly the
debt items 1 and 2 of the audit rollout are still carrying. `assistant-client`
is also the file where the rollout's own mistakes kept surfacing: four
`eslint-disable` directives that disabled nothing because they sat above a
comment rather than the element, and a memoised subtree that silently went stale
until `exhaustive-deps` caught it. Neither was findable by reading, in a file
that long.

## 2. What is actually there

All four share one shape, and it is a lucky one: **one enormous component,
followed by a tail of small components that are already properly factored and
merely co-located.** They take plain props and close over nothing.

| File                   | Already-standalone tail                                                                                                                                  | Roughly     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `worker-form.tsx`      | `RouteHostFields`, `KeyValidityHint`, `TtsFields`, `SttFields`, `VisionFields`, `DocumentFields`, `ImageGenFields`, `EmbeddingFields`, `LlmWorkerFields` | 1,300 lines |
| `files-client.tsx`     | `RenameDialog`, `CreateFolderDialog`, `CreateFileDialog`, `ChildFolders`, `DualPane`, `FilePane`, `FolderTreeRail`                                       | 700 lines   |
| `assistant-client.tsx` | `PromptCard`, `ArtifactView`, `ChannelBadge`, `StoredAttachmentView`                                                                                     | 170 lines   |
| `agents-client.tsx`    | `SkillPicker`, `ToolGroupPicker`, `DelegatePicker`, `ContextWindowHint`                                                                                  | 116 lines   |

That is **~2,300 lines that move out mechanically**, before a single hook is
touched.

And the state is not 31 unrelated things. `FilesView` is the clearest case —
its 30 `useState` fall into obvious clusters:

- **six** that are really one question, "which dialog is open"
  (`createFolderOpen`, `createFileExt`, `deleteFolderOpen`, `bulkDeleteOpen`,
  `cascadeConfirm`, `renameTarget`)
- **three** persisted view preferences that each read `localStorage` in a lazy
  initialiser (`view`, `sort`, `recentView`)
- **three** search (`query`, `hits`, `searching`)
- two inline-edit, one drag, and the actual data

## 3. The plan

Four phases, ordered so the risky work happens last and against a tree that has
already been made reviewable.

### Phase 0 — the ratchet, first

The audit's own central finding was that _every rule backed by a lint gate is
essentially perfect, and every prose-only rule has decayed._ A structure pass
with no gate behind it is a prose rule. Add `max-lines` as an **error** with the
threshold set to today's worst file:

```js
'max-lines': ['error', { max: 2507, skipBlankLines: false, skipComments: false }]
```

Nothing fails on day one, and no file may ever grow past the worst one that
exists. Lower the number with each landing; it can only go down.

**Why a threshold and not the warning ratchet.** `pnpm lint` runs
`--max-warnings 188`, and that cap is spoken for by `no-raw-form-control`.
Adding size warnings would mean raising it, which the house rule forbids for
good reason. A descending threshold is the same ratchet without the collision.

Count comments and blank lines, so the number means what `wc -l` says. This repo
comments heavily and deliberately, and that is a cost a reader pays too.

### Phase 1 — pure code motion

Move each already-standalone tail component into a sibling file. No signature
changes, no hook changes, no reordering. One commit per screen, four commits.

This is the cheapest 2,300 lines anyone will ever move, and it is verifiable in
a way later phases are not: **the built output should not meaningfully change.**
Compare per-route client JS before and after using the method in the audit
handover's §4 (sum the chunks each route's `_client-reference-manifest.js`
references). A large move is a mistake, not a win.

Do all four screens in this phase before starting Phase 2. It is mechanical,
it is safe, and finishing it means every subsequent diff is legible.

### Phase 2 — the state clusters, one screen at a time

Order: **`files-client` → `agents-client` → `worker-form` → `assistant-client`.**

That order is by risk, not by size. `FilesClient` is already a thin wrapper
around `FilesView`, so there is a seam to work at; `agents-client` already
exports its form types and has a sibling `agent-form-sections.tsx` to grow into;
`worker-form` is the biggest but its complexity is breadth, not depth.
`assistant-client` is last and deliberately so — see §6.

For each screen, in this order:

1. **Collapse the dialog cluster** into one discriminated union
   (`type Dialog = {kind:'rename', target:…} | {kind:'createFolder'} | null`).
   Six booleans that are mutually exclusive are one value, and the union makes
   the illegal states unrepresentable rather than merely unlikely.
2. **Extract the persisted preferences** into a hook with a pure core, and
   **test the core.** These lazy `localStorage` initialisers are also a live bug
   in the audit's §1 (hydration mismatch under a `force-dynamic` root layout),
   so this phase fixes something real rather than only moving it.
3. **Extract each remaining cluster** to a `use-*.ts` beside the screen, pure
   core exported and tested.
4. Only then look at what is left of the component.

### Phase 3 — the remainder

Whatever the big component still is after Phase 2, split by _what the user is
looking at_, not by line count. Stop when each file is one screen region a
reviewer can hold in their head. Do not chase a number for its own sake.

## 4. The shape to copy

Two precedents already in the tree. Use them rather than inventing a house
style:

**`app/(app)/tasks/` — the directory shape.** 1,789 lines across nine files,
largest 627: `tasks-client.tsx`, `task-board.tsx`, `task-detail.tsx`,
`task-form.tsx`, `task-todos.tsx`, `task-comments.tsx`, `page.tsx`, and
crucially `task-meta.ts` **with `task-meta.test.ts` beside it**. That last pair
is the point: the pure logic came out into a module that can be asserted
against, and the components stayed thin.

**`components/assistant/use-turn-stream.ts` — the hook shape.** State machine in
a hook, pure helpers (`applyStatusToTrail`, `createFrameFlusher`) exported
alongside it, scheduling injected so the tests need no browser. 11 tests run
against it without rendering anything, and the sibling `api-fetch.test.ts` runs
16 more against the transport the same way. That is the target for every hook this
plan extracts.

## 5. How to verify

- `pnpm verify` after every commit. Non-negotiable, and `react-hooks/exhaustive-deps`
  is an **error** here, which is a tool rather than an obstacle: when you move
  JSX into a `useMemo` or lift a body into a hook, write an empty dependency
  array and let ESLint compute the real one, then apply it verbatim.
- `pnpm -C client/web build` before each landing.
- **Per-route client JS, compared across the phase.** Phase 1 should be flat.
  Phases 2 and 3 should not regress it.
- Every extracted pure core gets tests in the same commit. A hook extracted
  without tests has moved the problem, not solved it.
- The e2e suite covers `/files`, `/tasks`, `/pages` and the settings screens.
  Once a brain is available, `E2E_SERVER_URL=… pnpm e2e` is the real regression
  net for this work — see `e2e/README.md`.

## 6. Landmines

**`assistant-client` is last for three reasons, all of them earned.** It carries
the live turn stream, the reconciliation of a streamed reply against the durable
row, and a documented double-reconciliation bug still open in the audit's §1. It
is also the screen with the outstanding signed-in click-through debt from
v0.6.48 and v0.6.50 — meaning the last two changes to it have _not_ been
exercised in a browser. **Do not start on it until that click-through has been
done.** Refactoring on top of unverified changes means a later bug has two
candidate causes and no way to separate them.

**Code motion must be code motion.** The temptation during Phase 1 is to "just
fix" something on the way past. Don't. A diff that both moves 400 lines and
changes behaviour is a diff nobody can review, and it destroys the one property
that makes Phase 1 safe: that the built output should not change.

**The lazy `localStorage` initialisers are a real bug, not a style problem.**
`useState(() => localStorage.getItem(…))` under a `force-dynamic` root layout
renders one value on the server and another on the client, and the team
workspace shell reads storage unguarded during render — which throws outright in
a browser that blocks site data. Fix them as bugs when Phase 2 reaches them, and
say so in the commit.

**Do not extract for the sake of the number.** A 300-line component that is one
coherent thing is better than three 100-line components that must be read
together. The `max-lines` threshold is a ceiling to stop growth, not a target to
optimise toward.

**Prettier reformats markdown tables.** If you script an edit to this file or
the audit handover, anchor on line content and assert the replacement happened.
Three silent no-ops in one session came from anchoring on exact column padding
that prettier had already changed.

## 7. What this pass is not

Not a rewrite. Not a state-management library — the app uses TanStack Query plus
local state deliberately, and nothing here argues with that. Not a component
library refactor; `packages/web-ui` is fine. Not the mobile-broken screens,
which are a separate audit item with a different fix.

And not a prerequisite for anything. Every other audit item is done or waiting
on a person; this one can be picked up and put down a phase at a time without
blocking release.
