/**
 * The `state` a heartbeat save sends. The brain stores state WHOLE, and the
 * heartbeat itself writes it while it runs (heartbeat_update_state). The edit
 * dialog fills the textarea from the state at the moment it opened, so a save
 * that always sent it rolled back anything the heartbeat wrote in between,
 * even when the person only changed the name or the schedule. On edit, state
 * is sent only when the person typed in the textarea. On create, a non-empty
 * textarea is sent (empty = the bound skill's defaultState, seeded by the
 * brain).
 */
export type HeartbeatStateSave =
  { ok: true; state?: Record<string, unknown> } | { ok: false; error: string };

export function heartbeatStateForSave(
  form: { state_text: string; state_edited: boolean },
  mode: 'create' | 'edit',
): HeartbeatStateSave {
  if (mode === 'edit' && !form.state_edited) return { ok: true };
  const raw = form.state_text.trim();
  if (!raw) return { ok: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // The parser message is the useful half: it is read against the JSON
    // just typed, which a toast takes away too soon.
    return {
      ok: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'State must be a JSON object (e.g. {"answered": []}).' };
  }
  return { ok: true, state: parsed as Record<string, unknown> };
}
