'use client';

import { createContext, useContext } from 'react';

/**
 * The folder the page being edited sits in, as it is NOW (folder phase 7):
 * what a Folder index block set to `here` lists. The SlashCommand extension
 * holds the folder the editor was made with; this carries the live value to
 * the block's NodeView, so a page that is moved while its editor is open (a
 * member files its draft in another folder from the tree beside it) lists
 * the folder it is in, not the one it left.
 *
 * `folderId` keeps its three states: a string is a folder, null the top
 * level, undefined "not known" (the block shows its label alone). No
 * provider at all (null) means the caller did not say: the block falls back
 * to the extension's storage.
 */
const HereFolderContext = createContext<{ folderId: string | null | undefined } | null>(null);

export const HereFolderProvider = HereFolderContext.Provider;

export function useHereFolder(): { folderId: string | null | undefined } | null {
  return useContext(HereFolderContext);
}

/** The block's `here`: the live value where a provider gives one (even when
 *  it is undefined, "not known"), else what the extension's storage holds.
 *  Never turns undefined into null: that would list the root. Pure. */
export function hereFolderOf(
  live: { folderId: string | null | undefined } | null,
  stored: string | null | undefined,
): string | null | undefined {
  return live ? live.folderId : stored;
}
