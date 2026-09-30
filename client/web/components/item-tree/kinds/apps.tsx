import { AppTile } from '@/components/app-nav/app-tile';
import { AudienceBadge } from '@/components/share/audience-badge';
import type { TreeKindAdapter } from './types';

/** Apps: the app's own tile (its icon and colour, the face every surface
 *  shows), then its level. */
export const appsAdapter: TreeKindAdapter = {
  kind: 'apps',
  noun: { one: 'app', many: 'apps' },
  lead: (item) => <AppTile icon={item.icon} color={item.color} kind="app" size="sm" />,
  status: (item) => <AudienceBadge level={item.level} className="px-1.5 py-0 text-[10px]" />,
};
