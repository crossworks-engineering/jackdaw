import type { TreeKind } from '@mantle/web-ui/types/tree';
import type { TreeKindAdapter } from './types';
import { filesAdapter } from './files';
import { drawAdapter, notesAdapter, tablesAdapter } from './simple';

/**
 * The member and client trees: the kinds a Library holds that the brain
 * serves as a read-only tree, and each one's row adapter.
 */
const ADAPTERS: Partial<Record<TreeKind, TreeKindAdapter>> = {
  files: filesAdapter,
  notes: notesAdapter,
  draw: drawAdapter,
  tables: tablesAdapter,
};

export function readerTreeAdapter(kind: TreeKind): TreeKindAdapter | null {
  return ADAPTERS[kind] ?? null;
}
