# Jackdaw

**The data-aware workspace** — the web + desktop interface for
[Mantle](https://github.com/crossworks-engineering/mantle) brains.

Jackdaw is a zero-secret client: it holds no database, no session secret, and
no server code. Every byte of data comes from a Mantle brain's HTTP API
(bearer + CORS), configured by a single value — the server origin. One
running Jackdaw can connect to any brain, and the roadmap makes that plural:
an origin registry with a brain switcher in the shell.

## Layout

- `client/web` — the owner UI (Next.js). `pnpm dev` runs it against the brain
  named by `MANTLE_SERVER_ORIGIN` (see `docs/db-less-dev.md`).
- `client/desktop` — the Electron shell wrapping the same UI.
- `packages/web-ui` — the UI kit (components, providers, hooks).
- `e2e` — the UI end-to-end suite (drives a running brain).

The wire contract is consumed from npm, published by the mantle repo on every
release: `@crossworks/{client-types,content-core,voice-client,share-ui,app-build}`.
Workspace imports keep the `@mantle/*` names; pnpm overrides map them to the
published packages (see the root `package.json`).

## Develop

```sh
pnpm install
pnpm dev          # owner UI on :3000 against MANTLE_SERVER_ORIGIN
pnpm verify       # typecheck + lint + format + tests
```

History note: this repo was extracted from the mantle monorepo on 2026-08-13
(`git filter-repo`), preserving the full commit history of every file it
carries. The split plan lives in mantle's `docs/plans/jackdaw-repo-split.md`.
