import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Runs scripts/test-tag-release.sh, the behavioural harness for
 * scripts/tag-release.sh (a local bare repo as origin, a stubbed pnpm, no
 * GitHub), so `pnpm verify` and CI's verify.yml run it on every change.
 *
 * Under /bin/bash where it exists: 3.2 on a Mac, the oldest bash the script
 * meets. GIT_* is dropped from the spawn: pre-push runs this with GIT_DIR set
 * for the real repo, and the harness's git must not reach it (the harness
 * drops them too, and refuses to run if one is left).
 */
const ROOT = join(__dirname, '..');
const BASH = existsSync('/bin/bash') ? '/bin/bash' : 'bash';
const cleanEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

describe('scripts/tag-release.sh', () => {
  it('passes its harness (verify before the tag, atomic push, origin asked)', () => {
    let out: string;
    try {
      out = execFileSync(BASH, [join(ROOT, 'scripts', 'test-tag-release.sh')], {
        cwd: ROOT,
        env: cleanEnv(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      throw new Error(`test-tag-release.sh failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`, {
        cause: e,
      });
    }
    expect(out).toMatch(/all passed/);
    expect(out).not.toMatch(/^FAIL /m);
  }, 90_000);
});
