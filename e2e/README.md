# e2e — the split's regression net

Playwright suite that drives a LIVE stack end-to-end. Written before the
server/client split (v0.200.0) so every phase of it lands against a green net.
One spec set, two topologies:

| Project       | Meaning                                                                                            | When it runs                                                          |
| ------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `same-origin` | client and server are one origin (the monolith, or the server app's own team/share/print surfaces) | CI on every PR + locally                                              |
| `split`       | client (owner UI) on its own origin, server on the canonical origin                                | gate for Phase 4+; auto-skipped while `E2E_CLIENT_URL` is unset/equal |

Specs: auth, pages CRUD, realtime SSE, `?at=` asset tokens, public share,
team-token entry, PDF export, the brain's `/app-runtime` CORS, the editor header, `/tasks`
behaviour, the resizable shell, and the shared field primitives. Fixtures make
specs topology-blind — same-origin auth is the session cookie, split auth is the
kind-`'m'` bearer (localStorage contract in `lib/contract.ts`).

⚠ **Never assert a transition from `getComputedStyle`.** Playwright injects
`*, ::before, ::after { transition: none !important }` into the page, so every
computed `transition-property` reads `none` under test and such an assertion
passes whatever the app does. Read the authored rules out of `document
.styleSheets` instead — `shell-layout.spec.ts` does, and the comment there
explains why.

## The route coverage gate (`pnpm e2e:routes`)

A different instrument from the suite: `e2e/check-routes.mjs` derives every
screen from `client/web/app`, opens each one in a real browser against a
deployment you name, and fails on anything that does not actually render —
an unresolved React placeholder, an empty `<main>`, a 5xx behind a tidy empty
state, a bounce to `/login`. GET-only, so it is safe against a brain people
rely on and against a read-only edge. It came from the mantle demo branch,
where its fixture-driven predecessor had shipped 85 blank screens; it lives
here because the route list has to be derived from the screens beside it.

```sh
pnpm e2e:routes -- https://demo.example                 # the target admits visitors (demo edge)
ROUTES_BEARER=<owner token> pnpm e2e:routes -- https://app.example   # split topology: seeds the bearer + presence cookie
ROUTES_ONLY=/journal,/traces pnpm e2e:routes -- …       # narrow the sweep
```

Dynamic segments are filled from read-only API fixtures (`FIXTURES` in the
script). A screen whose fixture is absent on that brain is reported SKIPPED,
never counted as a pass; a new dynamic screen with no fixture rule is named
so the gap is visible. `ROUTES_API_LOG=<path>` watches a local API log for
server-side errors the browser cannot see (the demo bench sets it).

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

### No brain to point at? Build a throwaway one

The brain is a mantle checkout. This assumes mantle's dev sidecars are already
up (`mantle_dev_pg`, `mantle_dev_minio`) — if they are not, `pnpm start` in that
repo brings them up. Everything here is deliberately beside the dev brain rather
than on top of it: its own database, its own bucket, its own port.

```sh
# in the mantle repo — a database and a bucket of its own
docker exec mantle_dev_pg psql -U postgres -d postgres -c 'CREATE DATABASE mantle_e2e;'
for f in infra/postgres/init/*.sql; do
  docker exec -i mantle_dev_pg psql -U postgres -d mantle_e2e -v ON_ERROR_STOP=1 < "$f"
done
docker exec mantle_dev_minio sh -c \
  'mc alias set local http://localhost:9000 minio minio12345 && mc mb -p local/mantle-e2e'

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54323/mantle_e2e'
pnpm -C packages/db migrate
pnpm -C server/web pgboss:init

DATABASE_URL="$DATABASE_URL" S3_BUCKET=mantle-e2e PORT=3900 \
  NEXT_PUBLIC_APP_URL=http://localhost:3900 \
  MANTLE_API_CORS_ORIGINS=http://localhost:3901 \
  MANTLE_CLIENT_ORIGIN=http://localhost:3901 \
  pnpm -C server/web dev
```

Then, back here: `E2E_SERVER_URL=http://localhost:3900 pnpm e2e`. The brain has
no owner, so global-setup creates one through the real signup path.

Three things that are easy to get wrong:

- **The init SQL must be applied by hand.** The Postgres image runs
  `/docker-entrypoint-initdb.d/*.sql` once, at first cluster init, for the
  DEFAULT database only. A new database on an existing cluster has no `vector`
  extension and no `auth.users`, and the migrations fail with a schema error
  that does not say so.
- **`pgboss:init` runs under `tsx --env-file-if-exists=./.env.local`**, and that
  file's `DATABASE_URL` points at the DEV brain. A shell variable does win — but
  confirm which database got the schema before starting anything that writes,
  because the thing you are about to point at it deletes content.
- **`MANTLE_API_CORS_ORIGINS` must name the client origin** (`:3901`), or every
  browser test fails on CORS while the API-only ones pass — a confusing split
  that looks like an auth bug.
- **`MANTLE_CLIENT_ORIGIN` must name it too**, for a different reason: the
  server's redirect stub uses it to send a member who lands on the brain's
  `/team` over to the client's token gate. Without it `team.spec.ts` waits
  thirty seconds for a gate that was never going to render, and the failure
  reads as a missing feature rather than as a brain that does not know where
  its client lives.

Tear down with `DROP DATABASE mantle_e2e` and `mc rb --force local/mantle-e2e`.

That combination — owner UI on its own origin, brain on another — _is_ the
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

### What used to be here, and where it is NOT

The runner used to boot a hermetic stack of its own: throwaway Postgres and
MinIO in Docker, `@mantle/db` migrations, pg-boss and the server app on `:3900`.
The split took it out of this repo, and the script kept calling four paths that
no longer exist — so the suite could not be started at all, which is how it
stayed broken quietly. `e2e/stack/docker-compose.yml` went the same way: it
mounted an `infra/` directory this repo does not have, and provisioned a
database for code that lives elsewhere now.

⚠️ **An earlier version of this file said that stack "moved to the mantle
repo". It did not.** Checked on 2026-09-15: mantle's `e2e/` holds
`node_modules`, `test-results` and a stale tsbuildinfo — no specs, no
`scripts/run-local.sh`, no compose file. The hermetic stack exists in NEITHER
repo, and the ports some notes still quote for it (55432 / 59000 / 59222) bind
nothing. If you go looking for it to save yourself the setup below, you will
lose an hour. Build the brain instead — the recipe is above and takes minutes.

Because nothing could run it, the suite quietly rotted: when it was first run
again on 2026-09-15 it was 135 of 161, and four of those failures were specs
that had broken the day a shell went translucent. Whatever else is true of this
directory, an e2e suite nobody can start is not a regression net.
