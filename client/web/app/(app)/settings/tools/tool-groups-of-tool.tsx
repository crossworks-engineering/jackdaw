'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { LEVEL_LABEL } from '@/lib/access-levels';
import {
  GROUP_LEVEL_UNKNOWN,
  toolGroupHref,
  type ToolGroupWithLevel,
} from '@/lib/tool-group-level';

/**
 * The groups that hold one tool, each with its level and whether it is on.
 * A tool reaches an agent or a team app only through a group, so this is
 * where its reach shows. Each name opens the group, where its level is set.
 */
export function ToolGroupsOfTool({
  groups,
  pending,
  error,
}: {
  /** The groups holding this tool (`groupsHolding`). */
  groups: ToolGroupWithLevel[];
  pending: boolean;
  error: string | null;
}) {
  return (
    <section
      className="space-y-2 rounded-lg border border-border p-3"
      aria-labelledby="tool-groups"
    >
      <p id="tool-groups" className="text-sm font-medium">
        Tool groups
      </p>
      {pending ? (
        <p className="text-xs text-muted-foreground">Loading tool groups…</p>
      ) : error ? (
        <p className="text-xs text-muted-foreground">Couldn’t load the tool groups: {error}</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          In no tool group. No agent or app can use it until a group holds it.{' '}
          <Link href="/settings/tool-groups" className="underline underline-offset-2">
            Open tool groups
          </Link>
        </p>
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              <Link
                href={toolGroupHref(g.slug)}
                className="truncate underline-offset-2 hover:underline"
              >
                {g.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {g.audience ? `${LEVEL_LABEL[g.audience]} level` : 'Level not shown'}
                {' · '}
                {g.enabled ? 'on' : 'off'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!pending && !error && groups.some((g) => g.audience === undefined) && (
        <p className="text-xs text-muted-foreground">{GROUP_LEVEL_UNKNOWN}</p>
      )}
    </section>
  );
}

/**
 * Beside "Team apps may use": the switch alone is not enough, an ENABLED
 * group at team level or lower must also hold the tool. Says so when none
 * does, and links to the group whose level to change.
 */
export function TeamAppsGroupNote({
  reach,
  groups,
}: {
  reach: 'yes' | 'no' | 'unknown';
  /** The groups holding this tool, enabled first. */
  groups: ToolGroupWithLevel[];
}) {
  if (reach !== 'no') return null;
  const target = groups[0];
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-ink">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Not in a team-level group yet: team apps cannot call it.{' '}
        {target ? (
          <Link href={toolGroupHref(target.slug)} className="underline underline-offset-2">
            {target.enabled ? `Change the level of ${target.name}` : `Open ${target.name}`}
          </Link>
        ) : (
          <Link href="/settings/tool-groups" className="underline underline-offset-2">
            Put it in a tool group
          </Link>
        )}
      </span>
    </p>
  );
}
