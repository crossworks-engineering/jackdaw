# Landing contact shares: put the contract pins back on npm

`feat/contact-shares` builds against contract types that are not on npm yet
(mantle `feat/contact-shares`: `dto/contact-shares.ts`,
`AccessNodeView.contactShares`, the `SharedLinkRow` contact fields,
`NeedsYou.sharing`). Until they are published, `@mantle/client-types` is
pinned by `file:` to the mantle build worktree in THREE places:

- `client/web/package.json` (`dependencies`)
- `packages/web-ui/package.json` (`dependencies`)
- `pnpm-workspace.yaml` (`overrides`)

and `pnpm-lock.yaml` records that path. This branch must NOT land on `main`
with those pins: the path exists only on one machine.

## The steps, in order

1. **Land mantle first.** Merge mantle `feat/contact-shares` with
   `scripts/merge-branch.sh feat/contact-shares` (it bumps the version on
   main as its own `release:` commit). Push main and the release tag
   `vX.Y.Z` when Jason says so.
2. **Publish the contract.** The tag fires mantle's `publish-contract`
   workflow. It publishes all five contract packages at the SAME version
   `X.Y.Z`: `@crossworks/client-types`, `content-core`, `voice-client`,
   `share-ui` and `app-build`. Check that `@crossworks/client-types@X.Y.Z`
   is on npm and carries `src/dto/contact-shares.ts` before step 3.
3. **Set the pins back to npm, all at `X.Y.Z`.** The overrides pin the
   `@crossworks/*` packages together, so move every one of them, not only
   client-types:
   - `pnpm-workspace.yaml` `overrides`: `@mantle/client-types`,
     `@mantle/content-core`, `@mantle/voice-client`, `@mantle/share-ui` to
     `npm:@crossworks/<name>@X.Y.Z`; delete the TEMPORARY comment;
   - `client/web/package.json`: `@mantle/client-types`,
     `@mantle/content-core`, `@mantle/share-ui`, `@mantle/voice-client`;
   - `packages/web-ui/package.json`: `@mantle/client-types`,
     `@mantle/share-ui`;
   - `e2e/package.json`: `@mantle/client-types` (it is still on the old npm
     version; keep it in step).
4. **Regenerate the lockfile.** `pnpm install --no-frozen-lockfile`. Then
   check that the link points at the npm copy, not the worktree:
   `readlink client/web/node_modules/@mantle/client-types` names
   `@crossworks+client-types@X.Y.Z`, and `grep -c nice-murdock pnpm-lock.yaml`
   prints 0.
5. **Verify.** `pnpm verify` (typecheck, lint, format, vitest). Exit 0 before
   the merge.
6. **Land jackdaw** with its own merge and release flow.

## Traps

- A `file:` pin is a COPY in `node_modules/.pnpm`, not a link. While the pin
  stays, a mantle-side contract change does not reach jackdaw until the copy
  is replaced by hand. Never replace it with a symlink: the TypeScript source
  then sits outside Turbopack's transpile scope and every re-export resolves
  to "module has no exports at all".
- Bumping a `package.json` pin alone leaves `pnpm install` "Already up to
  date" on the old version: the `pnpm-workspace.yaml` override wins. Move
  both.
- Do not publish the contract by hand from a feature branch. npm versions are
  immutable; the release tag is the one publish path.
