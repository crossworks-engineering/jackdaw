import type { AccessLevel } from '@mantle/client-types';
import { Badge } from '@mantle/web-ui/ui/badge';
import { cn } from '@mantle/web-ui/lib/utils';
import { AUDIENCE_TITLE } from '@/lib/access-levels';

/**
 * An item's access level on a card or a detail title. No badge at admin:
 * unlabelled means private, the quiet default. `hub` (apps only) wins: the
 * designated home app, which a member login sees as its home. Generalised
 * from the apps screen's old ExposureBadge.
 */
export function AudienceBadge({
  level,
  hub = false,
  className,
}: {
  level: AccessLevel | null | undefined;
  hub?: boolean;
  className?: string;
}) {
  if (hub) {
    return (
      <Badge
        className={cn('shrink-0', className)}
        title="Home app: members see it as their home"
      >
        hub
      </Badge>
    );
  }
  if (!level || level === 'admin') return null;
  return (
    <Badge
      variant={level === 'team' ? 'secondary' : 'outline'}
      className={cn('shrink-0', className)}
      title={AUDIENCE_TITLE[level]}
    >
      {level}
    </Badge>
  );
}
