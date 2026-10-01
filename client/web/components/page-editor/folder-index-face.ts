/**
 * What a Folder index block shows under its label (folder phase 7). Pure:
 * pinned by folder-index-face.test.ts.
 *
 * `label` is the label alone. That is the face when the folder is not known,
 * and also when the block means `here`, the caller said the reader may well
 * not hold that folder (`quietHere`), and the reader's tree answers 404: a
 * reviewer or a teammate reading a draft that sits in its author's own
 * private folder. They were never meant to open that folder, so "not shared
 * with you" would be the wrong thing to say. A block that names a folder by
 * id, or a `here` the reader should hold, keeps the 404 line.
 */
export type FolderIndexFace = 'label' | 'loading' | 'not-shared' | 'failed' | 'empty' | 'list';

export function folderIndexFace(a: {
  /** The folder and the reader's tree are both known. */
  known: boolean;
  pending: boolean;
  failed: boolean;
  /** The failure is the tree's 404. */
  notFound: boolean;
  /** The block has no folder of its own: it lists the page's (`here`). */
  fromHere: boolean;
  /** A 404 on `here` shows the label alone. */
  quietHere: boolean;
  count: number;
}): FolderIndexFace {
  if (!a.known) return 'label';
  if (a.pending) return 'loading';
  if (a.failed) {
    if (!a.notFound) return 'failed';
    return a.fromHere && a.quietHere ? 'label' : 'not-shared';
  }
  return a.count === 0 ? 'empty' : 'list';
}
