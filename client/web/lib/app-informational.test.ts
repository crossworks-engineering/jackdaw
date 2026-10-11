import { describe, expect, it } from 'vitest';
import {
  APP_INFORMATIONAL_HINT_OFF,
  APP_INFORMATIONAL_HINT_ON,
  APP_INFORMATIONAL_LABEL,
  APP_INFORMATIONAL_NOTE,
  informationalHint,
  informationalPatch,
  isInformational,
  supportsInformational,
} from './app-informational';

/**
 * An informational app (client logins C6): the brain's `dataReadOnly` says
 * so, an older brain's silence does not, and the admin's switch sends the
 * flag the owner app route takes.
 */
/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('an informational app', () => {
  it('is informational only when the brain says so', () => {
    expect(isInformational({ dataReadOnly: true })).toBe(true);
    expect(isInformational({ dataReadOnly: false })).toBe(false);
    expect(isInformational({})).toBe(false);
    expect(isInformational({ dataReadOnly: null })).toBe(false);
    expect(isInformational(null)).toBe(false);
  });

  it('says quietly that it is read, not written', () => {
    expect(APP_INFORMATIONAL_NOTE).toMatch(/^Informational: /);
    expect(APP_INFORMATIONAL_NOTE).toMatch(/read/);
  });

  it('shows the switch only to a brain that knows the flag', () => {
    expect(supportsInformational({ dataReadOnly: false })).toBe(true);
    expect(supportsInformational({ dataReadOnly: true })).toBe(true);
    expect(supportsInformational({})).toBe(false);
    expect(supportsInformational({ dataReadOnly: null })).toBe(false);
  });

  it('has no level gate since W5b2 (grants decide who reads the app)', () => {
    for (const audience of ['admin', 'public', null, undefined]) {
      expect(
        supportsInformational({ dataReadOnly: false, audience } as { dataReadOnly: boolean }),
        String(audience),
      ).toBe(true);
    }
  });

  it('sends the flag, and says what it means and what it is otherwise', () => {
    expect(informationalPatch(true)).toEqual({ dataReadOnly: true });
    expect(informationalPatch(false)).toEqual({ dataReadOnly: false });
    expect(APP_INFORMATIONAL_LABEL).toBe('Informational: only Admin can change its data');
    // Contract 36: on, the grants' Write does not apply; off, it decides.
    // The switch changes no grant, so neither line says it turns Write off.
    expect(informationalHint(true)).toBe(APP_INFORMATIONAL_HINT_ON);
    expect(informationalHint(false)).toBe(APP_INFORMATIONAL_HINT_OFF);
    expect(APP_INFORMATIONAL_HINT_ON).toMatch(/^On: only Admin can change/);
    expect(APP_INFORMATIONAL_HINT_ON).toMatch(/do not apply while this is on/);
    expect(APP_INFORMATIONAL_HINT_OFF).toMatch(
      /^Off: the Write switches in the Access panel decide/,
    );
    for (const s of [APP_INFORMATIONAL_HINT_ON, APP_INFORMATIONAL_HINT_OFF]) {
      expect(s).not.toMatch(/level|Write off/);
    }
  });

  it('writes no em or en dash in what a reader sees', () => {
    for (const s of [
      APP_INFORMATIONAL_NOTE,
      APP_INFORMATIONAL_LABEL,
      APP_INFORMATIONAL_HINT_ON,
      APP_INFORMATIONAL_HINT_OFF,
    ]) {
      expect(s).not.toMatch(DASHES);
    }
  });
});
