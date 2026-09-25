import type { AccessLevel } from '@mantle/client-types';
import { Badge } from '@mantle/web-ui/ui/badge';
import { cn } from '@mantle/web-ui/lib/utils';

const TITLE: Record<Exclude<AccessLevel, 'admin'>, string> = {
  team: 'Team: members see it in the team workspace',
  client: 'Client: anyone with the link can view it',
  public: 'Public: anyone with the link can view it',
};

/**
 * An item's access level on a card or a detail title. No badge at admin:
 * unlabelled means private, the quiet default. `hub` (apps only) wins: the
 * designated team hub renders full-screen at /team for members. Generalised
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
        title="Designated Team Hub: renders full-screen at /team for members"
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
      title={TITLE[level]}
    >
      {level}
    </Badge>
  );
}
