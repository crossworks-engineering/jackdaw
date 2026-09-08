# e2e — the split's regression net

Playwright suite that drives a LIVE stack end-to-end. Written before the
server/client split (v0.200.0) so every phase of it lands against a green net.
One spec set, two topologies:

| Project | Meaning | When it runs |
|---|---|---|
| `same-origin` | client and server are one origin (the monolith, or the server app's own team/share/print surfaces) | CI on every PR + locally |
| `split` | client (owner UI) on its own origin, server on the canonical origin | gate for Phase 4+; auto-skipped while `E2E_CLIENT_URL` is unset/equal |

Specs: auth, pages CRUD, realtime SSE, `?at=` asset tokens, public share,
team-token entry, PDF export, `/app-runtime` CORS, the editor header, `/tasks`
behaviour, the resizable shell, and the shared field primitives. Fixtures make
specs topology-blind — same-origin auth is the session cookie, split auth is the
kind-`'m'` bearer (localStorage contract in `lib/contract.ts`).

⚠ **Never assert a transition from `getComputedStyle`.** Playwright injects
`*, ::before, ::after { transition: none !important }` into the page, so every
computed `transition-property` reads `none` under test and such an assertion
passes whatever the app does. Read the authored rules out of `document
.styleSheets` instead — `shell-layout.spec.ts` does, and the comment there
explains why.

## Run it

**You bring the brain.** This repo is the client: no server workspace, no
database, so nothing here can start one. The runner brings the owner UI from
this checkout, puts it on `:3901` in front of the brain you name, and runs the
suite against that pair.

```sh
E2E_SERVER_URL=https://brain.example pnpm e2e        # boot the UI → suite → stop
E2E_SERVER_URL=… pnpm e2e:up      # keep the UI up while iterating…
E2E_SERVER_URL=… pnpm e2e:test    # …re-run the suite against it
pnpm e2e:down                     # stop it
```

⚠ **The suite CREATES AND DELETES CONTENT** on whatever brain you name. Point
it at a throwaway one, never at a brain anyone relies on.

That combination — owner UI on its own origin, brain on another — *is* the
`split` topology, so `pnpm e2e` runs the `split` project. The `same-origin`
project means one origin serving both, which this repo cannot produce locally;
run it directly against a box deployed that way:

```sh
E2E_SERVER_URL=https://box.example.com \
E2E_EMAIL=owner@example.com E2E_PASSWORD=… pnpm -C e2e e2e:same
```

A brain with no owner yet bootstraps itself through the REAL first-run path:
signup → onboarding saveKey (dummy OpenRouter key — saved regardless of probe)
→ provision → finish. No DB backdoors; the integrity gates get exercised too.
On a brain that already has one, set `E2E_EMAIL` / `E2E_PASSWORD` to match.

`E2E_SKIP_PDF=1` skips the PDF spec on brains without the browserless sidecar.
`E2E_CLIENT_PORT` moves the owner UI off `:3901`.

### What used to be here

The runner used to boot a hermetic stack of its own: throwaway Postgres and
MinIO in Docker, `@mantle/db` migrations, pg-boss and the server app on `:3900`.
The split moved all of it to the mantle repo, and the script kept calling four
paths that no longer exist — so the suite could not be started at all, which is
how it stayed broken quietly. `e2e/stack/docker-compose.yml` went with it: it
mounted an `infra/` directory this repo does not have, and provisioned a
database for code that lives elsewhere now.
