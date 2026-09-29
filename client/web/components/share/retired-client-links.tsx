'use client';

import Link from 'next/link';
// Relative, not '@/': the node test runner renders this (retired-client-links.test.ts).
import type { RetiredClientLinkRow } from '@mantle/client-types';
import {
  CLIENTS_HREF,
  retiredItemHref,
  retiredLevelLine,
  retiredOnLine,
  retiredViewsLine,
} from '../../lib/shared-links';

/**
 * The old client links the brain retired (client logins C3, migration 0192),
 * below the live links in Shared links: which customer URLs stopped, and how
 * much they were used, so the admin can add those people as clients. Quieter
 * than the live list on purpose: nothing here is open. A retired link has no
 * token (it asks its visitor to sign in as a client), so a row offers no
 * copy and no open; its title goes to the item itself. Nothing at all when
 * there are none (and on a brain before C3, which sends no list).
 */
export function RetiredClientLinks({ rows }: { rows: readonly RetiredClientLinkRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="retired-client-links-title" className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <h3 id="retired-client-links-title" className="text-xs font-semibold text-muted-foreground">
          Retired client links
        </h3>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        These old links now ask visitors to sign in as a client. Add the people who used them in{' '}
        <Link href={CLIENTS_HREF} className="underline underline-offset-2 hover:text-foreground">
          Clients
        </Link>
        .
      </p>
      <ul className="flex flex-col gap-1.5" aria-label="Retired client links">
        {rows.map((row) => (
          <li
            key={row.id}
            className="min-w-0 space-y-0.5 rounded-lg border border-dashed border-border px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={retiredItemHref(row)}
                className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {row.icon ? <span aria-hidden>{row.icon}</span> : null}
                <span className="truncate">{row.title || 'Untitled'}</span>
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">{retiredOnLine(row)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {retiredLevelLine(row)} · {retiredViewsLine(row)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
