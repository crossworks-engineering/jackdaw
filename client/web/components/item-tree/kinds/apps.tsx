import { AppTile } from '@/components/app-nav/app-tile';
import { AppTreePills } from '@/components/app-nav/app-tree-pills';
import type { TreeKindAdapter } from './types';

/** Apps: the app's own tile (its icon and colour, the face every surface
 *  shows), then the R and R/W pill. The share marks are the row's
 *  (TreeName). */
export const appsAdapter: TreeKindAdapter = {
  kind: 'apps',
  noun: { one: 'app', many: 'apps' },
  lead: (item) => <AppTile icon={item.icon} color={item.color} kind="app" size="sm" />,
  // The R and R/W pill (team apps Phase 3).
  status: (item) => <AppTreePills id={item.id} />,
};
