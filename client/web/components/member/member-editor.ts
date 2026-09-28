import type { AutosaveState } from '@/lib/member-autosave';

/**
 * What an own-item editor in Mine hands back to MineItem (member logins):
 * flush the working copy to the draft, and Save version. Both answer false
 * when the brain refused, so Submit (which takes the SAVED version) stops.
 * Every editor saves through the shared queue (lib/member-autosave.ts).
 */
export type MemberEditorHandle = {
  flush: () => Promise<boolean>;
  saveVersion: () => Promise<boolean>;
};

export type MemberEditorProps = {
  id: string;
  /** Hands MineItem the handle once the editor is ready. */
  handleRef: React.MutableRefObject<MemberEditorHandle | null>;
  /** True while there is work the saved version does not have yet. */
  onUnsavedChange: (unsaved: boolean) => void;
  /** The saved version changed (lists and the home show it). */
  onSaved: () => void;
  /** The autosave state, for MineItem's inline line (retrying, stopped). */
  onStatus?: (state: AutosaveState) => void;
  /** The item stopped being editable under the editor (submitted from
   *  another tab): it stays, showing what was typed, and takes no more
   *  changes until the member closes it (MineItem). */
  readOnly?: boolean;
};
