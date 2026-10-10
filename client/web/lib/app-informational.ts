/**
 * An informational app (client logins C6; workspaces W5b2): an app is
 * written by the users of each workspace whose grant has Write on. An admin
 * can mark it informational (`dataReadOnly`): the brain then turns Write off
 * on every grant beyond Admin in the same request, so members and clients
 * only read its data. Each grant's Write switch stays in the Access panel.
 *
 * The pure half, pinned by app-informational.test.ts: the words the member
 * and client views show, and what the admin's switch reads and sends.
 */
/** The owner's PATCH /api/apps/:id body that sets the informational flag. */
export type AppDataReadOnlyPatch = { dataReadOnly: boolean };

/** Is the app informational for this reader: only when the brain says so.
 *  Absent (a brain before C6) is not. */
export function isInformational(app: { dataReadOnly?: boolean | null } | null | undefined) {
  return app?.dataReadOnly === true;
}

/** The quiet line a member or a client reads on an informational app: it
 *  can still be used to read. */
export const APP_INFORMATIONAL_NOTE = 'Informational: you can read this app’s data, not change it.';

/** The short tag on a launcher card. */
export const APP_INFORMATIONAL_TAG = 'Informational';

/** The admin's switch, and the hint beside it (W5b2, contract 35: the brain
 *  sets every grant's Write beyond Admin in the same request). */
export const APP_INFORMATIONAL_LABEL = 'Informational: users outside Admin only read its data';
export const APP_INFORMATIONAL_HINT =
  'On: every workspace other than Admin gets Write off for this app. Change one workspace in the Access panel.';

/** Is the admin's switch shown: the brain knows the flag (its app detail
 *  carries it; a brain before C6 sends no `dataReadOnly`). No level gate
 *  since W5b2: who reads the app is its grants. */
export function supportsInformational(app: { dataReadOnly?: boolean | null }): boolean {
  return typeof app.dataReadOnly === 'boolean';
}

/** The owner app PATCH body for the switch. */
export function informationalPatch(on: boolean): AppDataReadOnlyPatch {
  return { dataReadOnly: on };
}
