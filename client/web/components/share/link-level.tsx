'use client';

import type { AccessLevel } from '@mantle/client-types';
import { Badge } from '@mantle/web-ui/ui/badge';
// Relative, not '@/': the node test runner renders this (link-level.test.ts).
import { OLD_CLIENT_LINK, isOldClientLink } from '../../lib/access-levels';
import { linkLevelLabel } from '../../lib/shared-links';

/**
 * A shared link's level, beside it in the Shared links list and header
 * (client logins C1). A live link on a client item is an OLD client link,
 * from when client meant "anyone with the link": marked, in plain words
 * (only on a brain before C3; a C3 brain retired them and lists them apart,
 * RetiredClientLinks). So
 * is one on an admin item (a task or an event, which stay admin): an old open
 * link. A brain before C1 sends no level, and then nothing extra shows.
 */
export function LinkLevel({ level }: { level: AccessLevel | undefined }) {
  if (!level) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <Badge variant="outline" className="shrink-0 font-medium">
        {linkLevelLabel(level)}
      </Badge>
      {isOldClientLink(level) ? (
        <span className="text-xs text-warning-ink">{OLD_CLIENT_LINK}</span>
      ) : null}
    </span>
  );
}
