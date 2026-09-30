import type { AccessLevel } from '@mantle/client-types';
import { Badge } from '@mantle/web-ui/ui/badge';
import { cn } from '@mantle/web-ui/lib/utils';
import { AUDIENCE_TITLE, readLevel, viaFolderTitle } from '@/lib/access-levels';

/**
 * An item's access level on a card or a detail title. No badge at admin:
 * unlabelled means private, the quiet default. `hub` (apps only) wins: the
 * designated home app, which a member login sees as its home. Generalised
 * from the apps screen's old ExposureBadge.
 *
 * `inherited`: the share it takes from a folder above (folder plan phase 4).
 * The badge shows the level it is READ at, the more open of the two, and
 * says so when the folder is why.
 */
export function AudienceBadge({
  level: own,
  inherited,
  hub = false,
  className,
}: {
  level: AccessLevel | null | undefined;
  inherited?: 'team' | 'client' | null;
  hub?: boolean;
  className?: string;
}) {
  if (hub) {
    return (
      <Badge className={cn('shrink-0', className)} title="Home app: members see it as their home">
        hub
      </Badge>
    );
  }
  const read = readLevel(own, inherited);
  if (!read || read.level === 'admin') return null;
  const level = read.level;
  return (
    <Badge
      variant={level === 'team' ? 'secondary' : 'outline'}
      className={cn('shrink-0', className)}
      title={read.viaFolder ? viaFolderTitle(level) : AUDIENCE_TITLE[level]}
    >
      {level}
      {read.viaFolder ? <span className="sr-only"> (shared through a folder)</span> : null}
    </Badge>
  );
}
