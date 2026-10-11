/**
 * The brain's own prompt text on Settings > Profile: what the brain is for
 * (`purpose`), its speciality (`purposeArchetype`) and the house style
 * (`houseStyle`). They ride every agent's prompt, so every heartbeat's turn,
 * and only the brain owner (its anchor login) changes them (W7a: PUT
 * /api/profile answers 403 for anyone else when one of them changes; the
 * onboarding purpose and persona steps likewise). Another login neither
 * sees nor sends them.
 *
 * Pure: pinned by profile-owner-fields.test.ts.
 */

/** The keys only the brain owner sends. */
export const OWNER_ONLY_PROFILE_KEYS = ['purpose', 'purposeArchetype', 'houseStyle'] as const;

/** What a login that is not the brain owner reads where those fields are. */
export const OWNER_ONLY_PROMPT_TEXT =
  "What this brain is for, its speciality and the house style are the brain owner's to set.";

/** The save body: the owner's as is; anyone else's without the owner's
 *  prompt keys, so an unrelated save never changes (or is refused over) them. */
export function profileSaveBody<T extends Record<string, unknown>>(
  body: T,
  owner: boolean,
): Partial<T> {
  if (owner) return body;
  const out: Record<string, unknown> = { ...body };
  for (const k of OWNER_ONLY_PROFILE_KEYS) delete out[k];
  return out as Partial<T>;
}
