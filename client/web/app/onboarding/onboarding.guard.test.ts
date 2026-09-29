import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * /onboarding is an admin's (audit A30e): a member or client login refused
 * there goes home (the shell shows its own screen) instead of meeting a
 * Retry that can only be refused again. The rule is unit-tested
 * (lib/member-destination.test.ts); this pins that the gate uses it.
 */
const src = readFileSync(
  fileURLToPath(new URL('./onboarding-client.tsx', import.meta.url)),
  'utf8',
);

describe('the onboarding gate', () => {
  it('leaves for home on a member or client refusal, with no retry of it', () => {
    expect(src).toContain(
      'const exit = stateQuery.data ? null : onboardingExitFor(stateQuery.error);',
    );
    expect(src).toMatch(/if \(exit\) router\.replace\(exit\);/);
    expect(src).toContain('retry: (count, err) => !isLoginRefusal(err) && count < 1,');
  });

  it('shows the spinner, not Retry, while it leaves', () => {
    expect(src).toContain('if (stateQuery.isPending || exit ||');
  });
});
