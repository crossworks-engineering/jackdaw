# Handover: the last 13 raw form controls

Current at **v0.6.95**, on main, green. This is **item 2** of
`docs/handover-audit-remainder.md` — read its §1 for how the other 175 were
converted, and §11 for where this sits among everything else still open.

> ### Start here
>
> **Run the `mantle-recall` skill first.** It loads the Mantle registry — the
> fleet, the boxes and their ssh aliases, how to start anything without
> duplicating a running instance, and the `jackdaw-ui-standards` map whose
> **UI component and theme ruleset** is the authority for the decisions below.
> This document tells you which controls are left and what each one needs; the
> registry tells you what the kit is for. Do not guess at either.
>
> Then `pnpm verify` before you touch anything, so a pre-existing failure is
> never mistaken for yours.

---

## What "done" is

`pnpm lint` runs `--max-warnings 13`, and all thirteen warnings are
`house/no-raw-form-control`. Done is **zero**, with the cap lowered to match and
the rule promoted from `warn` to `error` in `eslint-rules/house-style.mjs` — the
path `no-palette-literal`, `require-thin-scrollbar` and `require-noopener` each
took. **Lower the cap as the count falls; never raise it.**

Three of the thirteen may legitimately end as a sanctioned
`eslint-disable` with its reason written beside it, exactly as the `table-grid`
three did (§12 of the audit remainder). That still counts as done — the rule's
own escape hatch, used deliberately, is not a backlog.

## The thirteen, as they stand

Every line below was read on 2026-09-15 at v0.6.95. `pnpm lint` prints the same
list, so re-derive it rather than trusting this table after edits.

### Six native `<select>`

| file:line | what it is | the call |
| --- | --- | --- |
| `debug/chat-agent-override.tsx:53` | agent override picker, `h-7` chrome | debug surface — convert, nothing depends on it |
| `debug/tool-validation/tool-validation-client.tsx:80` | a days filter | debug surface — convert |
| `settings/(hub)/embedding/embedding-client.tsx:328` | `id="perf_preset"`, **no** `name` | convert |
| `settings/(hub)/embedding/embedding-client.tsx:510` | `name={prefix}_provider` | see **the FormData pair** below |
| `settings/(hub)/embedding/embedding-client.tsx:557` | `name={prefix}_api_key_id` | see **the FormData pair** below |
| `components/ui/model-select.tsx:331` | `aria-label="Sort models"`, an 11px sort control inside the model picker | the interesting one: a Radix listbox inside a popover that is itself a listbox |

### Four radio / checkbox

| file:line | what it is |
| --- | --- |
| `settings/accounts/[id]/folders/folder-picker.tsx:110` | `type="checkbox" name="folders" value={folder}` — one per folder |
| `settings/heartbeats/heartbeats-client.tsx:755` | `type="radio"`, `schedule_kind` |
| `settings/heartbeats/heartbeats-client.tsx:844` | `type="radio"`, `surface_kind` |
| `settings/heartbeats/heartbeats-client.tsx:884` | `type="radio"`, `gate_preset` |

The three heartbeats radios are a `RadioGroup` shaped like three separate
inputs. `RadioGroup` owns the roving tabindex and the arrow-key model, so the
conversion is a restructure around the group rather than a swap per input —
which is why they were left when the sweep was mechanical.

### Three inline text fields

| file:line | what it is |
| --- | --- |
| `tables/[id]/table-detail-client.tsx:709` | a tab rename, chrome-less on purpose |
| `components/dev-tools/request-builder.tsx:464` | a path-parameter value, dev tool |
| `components/tag-input.tsx:99` | `aria-label="Tags"`, the tag entry inside a chip row |

`Input` brings a border, a height and a ring. The rename and the tag entry can
take none of them: a box there draws a rectangle around a heading, or turns a
chip row into a row of boxes. **`Input` has no size scale** — it is a fixed
`h-10` — and the `table-grid` pass already recorded that giving it one turns its
popover search field into a twin. **Do that first and these stop being
exceptions.** It is the single change that moves the most of what is left.

---

## Two corrections to the old table

`docs/handover-audit-remainder.md` §1 says *"three of the six carry `name=` for
a native form POST **that Radix does not forward**"*. Both halves are wrong, and
they are why these two looked blocked:

1. **It is two, not three** — `embedding-client.tsx:510` and `:557`. Checked
   line by line; no other select in the thirteen carries a `name`.
2. **Radix does forward it.** The kit's `Select` *is* `SelectPrimitive.Root`
   (`packages/web-ui/src/ui/select.tsx:8`), so every Root prop passes through,
   and `@radix-ui/react-select` takes `name?: string` and renders a hidden
   native control for form participation.

### The FormData pair

They matter because `handleSave` really does read the form, not the state:

```ts
// embedding-client.tsx:197
function handleSave(e: React.FormEvent<HTMLFormElement>) {
  const body = Object.fromEntries(new FormData(e.currentTarget));   // :199
```

So the `name` is load-bearing — drop it and the provider and API key silently
stop being saved, with no type error and no failing test. **Pass `name` to
`<Select>` and verify with a real submit**, watching the request body rather
than the screen: this is the shape of bug that passes typecheck, unit tests and
a look at the page. If the hidden control does not bubble for any reason, the
fallback is to read the two values from state in `handleSave` instead of from
`FormData` — a smaller change than it sounds, and arguably better regardless.

---

## How to check the work

**Measure the geometry, do not look at it.** A conversion is supposed to change
nothing visible, so what to watch for is a control that **collapses** when a
primitive stops supplying its box — the `table-grid` pass found this by counting
467 buttons and asserting **zero of zero width**. It is a DOM query, not a
screenshot. The same pass also found that a programmatic `.focus()` does not set
`:focus-visible` in Chrome: press a real Tab before believing a ring is missing.

**The twins table in the style guide is the decision procedure**, not this file:
a site that sets a box matching a twin takes the twin; a site that sets no box
takes `RowButton`. Giving a padding-less control a boxed twin moves everything
around it.

**A brain with tables is needed for the `table-detail-client` one**, and the
rest want a signed-in pass. `e2e/README.md` has the throwaway-brain recipe —
minutes, and it leaves the dev brain alone. `pnpm e2e` is green at **161/162**
as of v0.6.95; keep it that way, and re-run it after touching anything in
`settings/` or `tables/`, which several specs drive.

## Habits this repo expects

- **Worktrees**: `scripts/new-worktree.sh <name>`. Land with
  `scripts/merge-branch.sh <branch>`, which bumps the version on main as part
  of the merge — it is ff-only, so rebase on main first if main has moved.
- **`pnpm verify` before handing anything over.** The lint cap only ever falls.
- Both repos are public: no client names, hostnames or IPs in commits or code.
- Releasing is three acts — tag, **publish the draft**, set it Latest — and the
  second is the one that has been missed. Do not chain a merge with a tag.
