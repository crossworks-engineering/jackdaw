/**
 * Search across workspaces on the wire (brain task f26a516e). A search (GET
 * /api/search, and GET /api/tree/:kind/search asked with `across=1`) looks
 * in every workspace the login reads; the switcher's workspace (`ws`) only
 * orders it. Each hit names the workspace it opens in. A folder page asked
 * with `ws` counts the items only another of the login's workspaces reads.
 *
 * A copy of mantle packages/client-types/src/dto/workspace-hits.ts plus the
 * optional fields that change adds to packages/client-types/src/tree.ts
 * (mantle feat/ws-search). Replace the copy by hand when the published
 * package carries them. Every field is optional: a brain before it sends
 * none, and the screens then show no tag and do not switch.
 *
 * Pure: types only.
 */
import type {
  TreeCrumb,
  TreeFolder,
  TreeFolderPage,
  TreeItem,
  TreeSearchResult,
} from '@mantle/web-ui/types/tree';

/** The workspace a hit opens in: a live workspace the login is a user of
 *  that reads the item. The switcher's workspace when it reads the item,
 *  else the item's home when the login is in it, else the first by name. */
export type HitWorkspace = { id: string; name: string };

/** What a search hit carries beside its own fields. */
export type HitWorkspaceField = { workspace?: HitWorkspace };

/** Items of one folder that another workspace of the login reads, none of
 *  them read by the switcher's workspace (TreeFolderPage `elsewhere`). */
export type ElsewhereCount = { id: string; name: string; count: number };

/** A folder asked with `ws`: the items there only the login's other
 *  workspaces read (not in `itemCount`). */
export type TreeFolderWithElsewhere = TreeFolder & { itemsElsewhere?: number };

/** A folder page asked with `ws`: on a first page where `ws` reads no item,
 *  the login's other workspaces that read items in the same folder. */
export type TreeFolderPageWithElsewhere = TreeFolderPage & { elsewhere?: ElsewhereCount[] };

/** One item of a tree search asked `across`. */
export type TreeSearchHit = TreeItem & { crumbs: TreeCrumb[] } & HitWorkspaceField;

/** A tree search: `across` echoed when the brain searched every workspace. */
export type TreeSearchAcross = Omit<TreeSearchResult, 'items'> & {
  items: TreeSearchHit[];
  across?: true;
};
