/**
 * An informational app (client logins C6; workspaces W5b2, contract 36): an
 * app is written by the users of each workspace whose grant has Write on.
 * An admin can mark it informational (`dataReadOnly`): while it is on,
 * nobody beyond Admin writes the app's data, whatever the grants say. The
 * switch changes no grant: turned off, the grants' Write switches in the
 * Access panel decide again, as they were.
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

/** The admin's switch, and the hint beside it for each state (contract 36:
 *  the switch changes no grant; on, it stops every write beyond Admin). */
export const APP_INFORMATIONAL_LABEL = 'Informational: only Admin can change its data';
export const APP_INFORMATIONAL_HINT_ON =
  'On: only Admin can change this app’s data. The Write switches in the Access panel do not apply while this is on.';
export const APP_INFORMATIONAL_HINT_OFF =
  'Off: the Write switches in the Access panel decide who can change this app’s data.';

/** The hint for the switch as it is now. */
export function informationalHint(on: boolean): string {
  return on ? APP_INFORMATIONAL_HINT_ON : APP_INFORMATIONAL_HINT_OFF;
}

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
