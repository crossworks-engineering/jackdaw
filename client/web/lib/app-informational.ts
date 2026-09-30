/**
 * An informational app (client logins C6, Jason's rule of 2026-09-30): an
 * app an admin sets to TEAM or CLIENT level is a shared workspace, run AND
 * written by everyone who can see it (members at team and client level,
 * clients at client level). An admin can mark it informational
 * (`dataReadOnly`): then members and clients only read its data. A public
 * app is read only for members too, and its card says so the same way.
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

/** The admin's switch, and the hint beside it. */
export const APP_INFORMATIONAL_LABEL = 'Informational: members and clients only read its data';
export const APP_INFORMATIONAL_HINT =
  'Otherwise a team or client app is written by everyone who runs it.';

/** Is the admin's switch shown: the brain knows the flag (its app detail
 *  carries it, C6 on; a brain before C6 sends no `dataReadOnly`), and the
 *  app is at a level the flag means something at (client tier audit N1).
 *  Only a team or client app is written by the people who run it: an admin
 *  app has no other readers, and members only ever read a public one. */
export function supportsInformational(app: {
  dataReadOnly?: boolean | null;
  audience?: string | null;
}): boolean {
  return (
    typeof app.dataReadOnly === 'boolean' && (app.audience === 'team' || app.audience === 'client')
  );
}

/** The owner app PATCH body for the switch. */
export function informationalPatch(on: boolean): AppDataReadOnlyPatch {
  return { dataReadOnly: on };
}
