# Handover: the 2026-09-15 session — form controls, a release, the CI gate, the assistant's re-renders

Current at **v0.6.105**, on main, pushed. Everything below is landed unless it
says otherwise.

> ### Start here
>
> **Run the `mantle-recall` skill first** — the fleet, the ssh aliases, and the
> `jackdaw-ui-standards` map that is the authority for the UI decisions here.
> Then `pnpm verify`, so a pre-existing failure is never mistaken for yours.
>
> The detail for each item is in `docs/handover-audit-remainder.md`: **§15**
> (form controls), **§16** (radio groups), **§17** (assistant re-renders),
> **§18** (the CI gate). This file is the map and the judgement calls; those
> sections carry the measurements.

---

## What happened, in one list

|               |                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| v0.6.97       | The last 13 raw form controls: **188 → 0**, `no-raw-form-control` is `error`, lint cap 0. `Input` gained a size scale. |
| v0.6.98       | `SelectTrigger` got the same rungs; its default moved `h-9` → `h-10` to match `Input`.                                 |
| v0.6.99       | Arrow keys select in `RadioGroup` **and** `ToggleGroup`.                                                               |
| **v0.6.100**  | **Released and Latest** — the first cut since v0.6.93, carrying six untagged versions. Dev box rolled onto it.         |
| v0.6.101–.105 | The CI e2e gate: it now builds its own brain per run.                                                                  |
| _(pending)_   | The dock context split + turn-row memo — see "What is NOT landed".                                                     |

Two of those came from agents run in parallel, and **both did better than the
brief**: the `SelectTrigger` one found 28 of 76 call sites hand-sizing (I had
estimated ~20), and the `RadioGroup` one **disproved my written diagnosis** —
see §16. That is the second time in this document's history that a confident
written diagnosis was the expensive thing to inherit.

## The three judgement calls worth inheriting

**1. A handover's correction can be right and still point at the wrong fix.**
`docs/handover-form-controls.md` corrected an earlier claim to say Radix DOES
forward a `name` on `<Select>`. True — and taking that route would still have
broken the embedding save, because Radix forbids `''` as an item value, so the
keyless API key travels as a sentinel and the hidden native control would have
POSTed `__none__` as a key id. No type error, no failing test. §15 has the
measurement; the fix is a colocated hidden input.

**2. "Done in git" is not "on the box", and there is a third failure shape.**
main was six versions ahead of the newest tag. This was NOT the old
21-unpublished-drafts failure — there were no drafts, because **no tag had ever
been cut**, one step earlier. Compare THREE numbers, not two: `package.json` on
main, the newest tag, and what the box reports at `/settings/updates`.

**3. Measure before you fix, and counter-check after.** §17's two items were
both real when measured — but the counter-check matters as much: a context split
that simply disconnects a consumer shows the same improvement as one that works.
`AppShell` was verified to STILL re-render on a layout change.

## What is NOT landed

~~**`feat/dock-context`**~~ — landed; released as v0.6.107.

**`fix/asset-url-reactivity`** — audit items 1 and 2 (§6 and §17), both
committed, `pnpm verify` green, both verified in a detached browser against the
dev brain. Land with `scripts/merge-branch.sh fix/asset-url-reactivity`.
Two things to know before you do:

- The assistant transcript has **no e2e spec**, so CI will not catch a
  regression in `RichText`. `PageView` is covered.
- A callout in a settled reply now renders without its icon. That is the share
  surface's look, it is deliberate, and it is the one open question — see §17.

## What is left on the audit

1. ~~**`assetUrl` reactivity** (§6)~~ — **done.** The token is a store; the
   imperative callers await it, the rendering ones subscribe.
2. ~~**Settled turns as static HTML** (§17)~~ — **done**, and both stated
   blockers were false: the CSS fallback already ships, and the server renderer
   emits the same bare div. Read §17 before trusting anything else in this file
   that was reasoned rather than measured.
3. **mantle → v0.232.184**, and refresh `client-pair.tag`, which still reads
   **v0.6.82** and says so in the product on `/settings/updates`.
4. **Two things that need a human**, both cheap now the box is live on this
   code: drag a task card between columns (§13 was verified structurally, never
   by a live drag), and edit a heading and watch the page outline follow (§14).

## Habits this repo expects

- **Worktrees**: `scripts/new-worktree.sh <name>`; land with
  `scripts/merge-branch.sh <branch>`, which bumps the version on main.
- **`pnpm verify` before handing anything over.** The lint cap only ever falls,
  and the max-lines ceiling only ever falls — it caught a 1,821-line file in
  this session and was right to.
- **Releasing is three acts** — tag, **publish the draft**, set Latest — and
  before publishing, count the drafts carrying the tag and check the assets
  (11, and all three updater manifests).
- Both repos are public: no client names, hostnames or IPs in commits or code.
