import { AppTile } from '@/components/app-nav/app-tile';
import { AppTreePills } from '@/components/app-nav/app-tree-pills';
import { AudienceBadge } from '@/components/share/audience-badge';
import type { TreeKindAdapter } from './types';

/** Apps: the app's own tile (its icon and colour, the face every surface
 *  shows), then the R and R/W pill and its level. */
export const appsAdapter: TreeKindAdapter = {
  kind: 'apps',
  noun: { one: 'app', many: 'apps' },
  lead: (item) => <AppTile icon={item.icon} color={item.color} kind="app" size="sm" />,
  // The R and R/W pill (team apps Phase 3) before the level.
  status: (item) => (
    <span className="flex shrink-0 items-center gap-1">
      <AppTreePills id={item.id} />
      <AudienceBadge level={item.level} className="px-1.5 py-0 text-[10px]" />
    </span>
  ),
};
