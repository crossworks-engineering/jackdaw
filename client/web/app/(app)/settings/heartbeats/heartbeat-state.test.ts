import { describe, expect, it } from 'vitest';
import { heartbeatStateForSave } from './heartbeat-state';

describe('heartbeatStateForSave', () => {
  const opened = { state_text: '{\n  "answered": [1]\n}', state_edited: false };

  it('an edit that did not touch the state leaves it out (the heartbeat may have written newer state)', () => {
    expect(heartbeatStateForSave(opened, 'edit')).toEqual({ ok: true });
  });

  it('an edit that typed in the state sends it', () => {
    expect(
      heartbeatStateForSave({ state_text: '{"answered": [1, 2]}', state_edited: true }, 'edit'),
    ).toEqual({ ok: true, state: { answered: [1, 2] } });
  });

  it('a create sends a filled textarea even when untouched (the skill default)', () => {
    expect(heartbeatStateForSave(opened, 'create')).toEqual({
      ok: true,
      state: { answered: [1] },
    });
  });

  it('an empty textarea sends nothing', () => {
    expect(heartbeatStateForSave({ state_text: '  ', state_edited: true }, 'edit')).toEqual({
      ok: true,
    });
  });

  it('refuses bad JSON and non-objects, only when it would be sent', () => {
    const bad = { state_text: '{nope', state_edited: true };
    expect(heartbeatStateForSave(bad, 'edit').ok).toBe(false);
    expect(heartbeatStateForSave({ state_text: '[1]', state_edited: true }, 'edit').ok).toBe(false);
    expect(heartbeatStateForSave({ ...bad, state_edited: false }, 'edit')).toEqual({ ok: true });
  });
});
