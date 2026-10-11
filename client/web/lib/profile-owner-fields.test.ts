import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OWNER_ONLY_PROFILE_KEYS, profileSaveBody } from './profile-owner-fields';

const body = {
  timezone: 'UTC',
  purpose: 'x',
  purposeArchetype: 'general',
  houseStyle: 'no dashes',
  siteName: 'Brain',
};

describe("the brain owner's prompt text on Profile (W7a)", () => {
  it('the owner sends it', () => {
    expect(profileSaveBody(body, true)).toEqual(body);
  });

  it('anyone else sends everything but it', () => {
    const out = profileSaveBody(body, false);
    for (const k of OWNER_ONLY_PROFILE_KEYS) expect(out).not.toHaveProperty(k);
    expect(out).toEqual({ timezone: 'UTC', siteName: 'Brain' });
  });

  it('the screen hides the three fields for anyone else and builds its body here', () => {
    const src = readFileSync(
      fileURLToPath(
        new URL('../app/(app)/settings/(hub)/profile/profile-client.tsx', import.meta.url),
      ),
      'utf8',
    );
    expect(src).toContain('const owner = useIsBrainOwner();');
    expect(src).toContain('profileSaveBody(');
    expect(src).toMatch(
      /\{owner \? \(\s*<>\s*<div className="space-y-1.5">\s*<Label htmlFor="purposeArchetype">/,
    );
  });
});

describe('onboarding: the purpose and persona steps are the owner’s (W7a)', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/onboarding/onboarding-client.tsx', import.meta.url)),
    'utf8',
  );

  it('anyone else continues past them without a save', () => {
    expect(src).toContain('owner={isOwnerShell(shellQuery.data)}');
    expect(src).toContain("{step === 'purpose' && owner && (");
    expect(src).toContain("{step === 'personality' && owner && (");
    expect(src).toMatch(
      /case 'purpose':\s*return owner\s*\? \{ label: 'Save & continue', onClick: onSavePurpose \}\s*: \{ label: 'Continue'/,
    );
    expect(src).toMatch(
      /case 'personality':\s*return owner\s*\? \{ label: 'Save & continue', onClick: onSavePersona \}\s*: \{ label: 'Continue'/,
    );
  });
});
