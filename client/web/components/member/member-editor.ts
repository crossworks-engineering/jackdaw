/**
 * What an own-item editor in Mine hands back to MineItem (member logins):
 * flush the working copy to the draft, and Save version. Both answer false
 * when the brain refused, so Submit (which takes the SAVED version) stops.
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
};
