/**
 * The brain's purpose field: its size limit and the "is this really a persona
 * prompt?" check, shared by the onboarding wizard and Settings → Profile.
 *
 * The purpose is one or two sentences on what the brain is FOR. On 2026-09-28 a
 * user read the old wording as "the assistant's persona" and pasted a
 * 3,888-character personality prompt; the server kept the first 600 characters
 * without a word and the assistant kept its default personality. The server now
 * refuses anything over the limit, and this module lets the UI say so first.
 */

/**
 * Mirror of `PURPOSE_MAX_CHARS` in `@mantle/client-types/purpose-limits`. The
 * pinned contract predates that module; import it from there at the next pin
 * bump and delete this copy.
 */
export const PURPOSE_MAX_CHARS = 600;

/** Paste length above which the persona hint shows even without other signs:
 *  a real "one or two sentences" purpose rarely passes 400 characters. */
const LONG_PASTE_CHARS = 400;

export type PurposeCheck = {
  /** Trimmed length, the number the server measures. */
  length: number;
  /** True when the server would refuse it. */
  over: boolean;
  /** True when the text reads like an assistant persona / system prompt. */
  looksLikePersona: boolean;
};

/**
 * Signs that the text is a persona prompt, not a purpose: it opens by
 * addressing the assistant ("You are…", "Act as…"), it carries markdown
 * headings, or it is simply far longer than a purpose ever needs to be.
 */
export function looksLikePersonaPrompt(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(you are|you're|act as|your name is|your role is|as an ai)\b/i.test(t)) return true;
  if (/^#{1,6}\s+\S/m.test(t)) return true;
  return t.length > LONG_PASTE_CHARS;
}

export function checkPurpose(text: string): PurposeCheck {
  const length = text.trim().length;
  return {
    length,
    over: length > PURPOSE_MAX_CHARS,
    looksLikePersona: looksLikePersonaPrompt(text),
  };
}
