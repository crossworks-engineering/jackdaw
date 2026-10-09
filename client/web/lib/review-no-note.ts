/**
 * Review flows carry no messages (2026-10-09): Return and Give back send no
 * note of the admin's. A brain from before that change still requires a
 * non-empty `note` (it answers 400 "Say what needs to change." to an empty
 * one), and the desktop app updates before every box is rolled. So both
 * calls send this fixed line: an older brain stores and shows it, a current
 * brain ignores it. Drop it once the fleet runs the no-note brain.
 */
export const OLDER_BRAIN_RETURN_NOTE = 'Sent back for changes.';
