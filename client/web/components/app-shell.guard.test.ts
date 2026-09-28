import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The shell fails closed (client logins C0), pinned where the node test
 * runner cannot render it (the shell needs the Next router and the query
 * client). The rules themselves are unit-tested: lib/shell-role.test.ts (the
 * role) and components/member/viewer-role.test.ts (the gate's screens).
 */
const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const shell = src('./app-shell.tsx');
const layout = src('../app/(app)/layout.tsx');

describe('no default of admin', () => {
  it('the layout seeds a member from the hint, or nothing', () => {
    expect(layout).toContain(
      "const role = cookieStore.get(MEMBER_HINT_COOKIE)?.value === '1' ? 'member' : null;",
    );
    expect(layout).not.toMatch(/'admin'/);
  });

  it('the shell never falls back to admin', () => {
    expect(shell).not.toMatch(/\?\? 'admin'|= 'admin'|: 'admin'\s*[,;)]/);
    expect(shell).toContain("role: 'member' | null;");
  });
});

describe('the shell renders for a confirmed role only', () => {
  it('everything, providers and frame, sits inside the role gate', () => {
    expect(shell).toMatch(
      /<ViewerRoleProvider role=\{role\}>\s*<ShellRoleGate role=\{role\} probeFailed=\{probeFailed\} onRetry=\{retry\}>\s*\{\(confirmed\) => \(\s*<ToastProvider>/,
    );
    expect(shell).toContain('<ShellFrame {...props} role={confirmed} probes={probes} />');
    // One frame, and only there.
    expect(shell.match(/<ShellFrame /g)).toHaveLength(1);
  });

  it('the role comes from the brain through resolveShellRole', () => {
    expect(shell).toContain('const role = resolveShellRole(input);');
    expect(shell).toContain(
      'const { role, probeFailed, retry, probes } = useShellRole(props.role);',
    );
  });

  it('no retry on any of the three refusals', () => {
    expect(
      shell.match(/retry: \(count, err\) => !isLoginRefusal\(err\) && count < 1/g),
    ).toHaveLength(2);
  });

  it('a client refusal clears the member hint and navigates nowhere', () => {
    const effect = shell.slice(
      shell.indexOf('const isClient ='),
      shell.indexOf('const shellLoaded'),
    );
    expect(effect).toContain('if (isClient) setMemberHint(false);');
    expect(effect).not.toMatch(/location|router/);
  });
});
