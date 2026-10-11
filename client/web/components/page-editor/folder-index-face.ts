/**
 * What a Folder index block shows under its label (folder phase 7). Pure:
 * pinned by folder-index-face.test.ts.
 *
 * `label` is the label alone, the face when the folder or the reader is not
 * known. A folder the reader's tree answers 404 for says it is not shared
 * with them; any other failure says the list could not be read.
 */
export type FolderIndexFace = 'label' | 'loading' | 'not-shared' | 'failed' | 'empty' | 'list';

export function folderIndexFace(a: {
  /** The folder and the reader's tree are both known. */
  known: boolean;
  pending: boolean;
  failed: boolean;
  /** The failure is the tree's 404. */
  notFound: boolean;
  count: number;
}): FolderIndexFace {
  if (!a.known) return 'label';
  if (a.pending) return 'loading';
  if (a.failed) return a.notFound ? 'not-shared' : 'failed';
  return a.count === 0 ? 'empty' : 'list';
}
