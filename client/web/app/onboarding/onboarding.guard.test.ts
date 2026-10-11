import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * /onboarding sets up the brain: the settings area's (W5c). A member or a
 * client that types the address goes home instead of meeting a Retry that
 * the brain refuses again. The rule is unit-tested (onboardingExit in
 * lib/workspaces.test.ts); this pins that the gate uses it.
 */
const src = readFileSync(
  fileURLToPath(new URL('./onboarding-client.tsx', import.meta.url)),
  'utf8',
);

describe('the onboarding gate', () => {
  it('asks the shell, and leaves for home when the login may not onboard', () => {
    expect(src).toContain("queryFn: () => apiFetch<Shell>('/api/shell'),");
    expect(src).toContain('const exit = onboardingExit(shellQuery.data);');
    expect(src).toMatch(/if \(exit\) router\.replace\(exit\);/);
  });

  it('reads the wizard state only for a login it is for', () => {
    expect(src).toContain('enabled: !shellQuery.isPending && exit === null,');
  });

  it('shows the spinner, not Retry, while it leaves', () => {
    expect(src).toMatch(/if \(\s*exit \|\|\s*shellQuery\.isPending \|\|/);
  });
});
