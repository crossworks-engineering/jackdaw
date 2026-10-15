/**
 * Search across workspaces (brain task f26a516e), the pure half: when a
 * hit is tagged with another workspace, what the tag says, and what the
 * hint under an empty folder says. The screens draw what this decides.
 *
 * A hit is tagged exactly when opening it switches: a workspace is picked
 * in the switcher, the hit opens in another one, and the login holds that
 * one (the shell lists it). On "All my workspaces", from a brain that names
 * no workspace, or for a workspace the shell does not list, there is no tag
 * and opening it switches nothing.
 */
import type { ElsewhereCount, HitWorkspace } from './contract/workspace-hits';
import { workspaceLabel, type ShellWorkspace } from './workspaces';

type Held = Pick<ShellWorkspace, 'id' | 'name' | 'private'>;

/** The `workspace` a search hit carries (HitWorkspace), read from any row:
 *  a tree item is a hit only in a search asked across workspaces. */
export function hitWorkspaceOf(hit: unknown): HitWorkspace | undefined {
  const w = (hit as { workspace?: unknown } | null | undefined)?.workspace as
    Partial<HitWorkspace> | null | undefined;
  return typeof w?.id === 'string' && typeof w.name === 'string'
    ? { id: w.id, name: w.name }
    : undefined;
}

/** The workspace to switch to before `hit` opens, or null to open it where
 *  the login is. `current`: the switcher's workspace (null = All). */
export function switchFor<W extends Held>(
  hit: unknown,
  current: string | null,
  workspaces: readonly W[],
): W | null {
  const to = hitWorkspaceOf(hit)?.id;
  if (!current || !to || to === current) return null;
  return workspaces.find((w) => w.id === to) ?? null;
}

/** A workspace's name on a tag or a hint: the switcher's own label ("Only
 *  you" for the login's private workspace). */
export function hitLabel(w: Pick<ShellWorkspace, 'name' | 'private'>): string {
  return workspaceLabel(w);
}

/** At most this many workspaces on the hint under an empty folder. */
export const ELSEWHERE_MAX = 3;

/** The workspaces the hint names: the brain's list (most first), only those
 *  the login holds and not the current one, at most ELSEWHERE_MAX. */
export function elsewhereShown<W extends Held>(
  list: readonly ElsewhereCount[] | undefined,
  current: string | null,
  workspaces: readonly W[],
): Array<{ workspace: W; count: number }> {
  if (!current || !list?.length) return [];
  const out: Array<{ workspace: W; count: number }> = [];
  for (const e of list) {
    if (e.id === current || !(e.count > 0)) continue;
    const workspace = workspaces.find((w) => w.id === e.id);
    if (workspace) out.push({ workspace, count: e.count });
    if (out.length === ELSEWHERE_MAX) break;
  }
  return out;
}

/** One line of the hint: "2 pages in Admin". */
export function elsewhereText(
  count: number,
  noun: { one: string; many: string },
  workspace: Pick<ShellWorkspace, 'name' | 'private'>,
): string {
  return `${count} ${count === 1 ? noun.one : noun.many} in ${hitLabel(workspace)}`;
}
