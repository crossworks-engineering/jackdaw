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
  it('the layout seeds a client or a member from the hints (the client first), or nothing', () => {
    expect(layout.replace(/\s+/g, ' ')).toContain(
      "const role = cookieStore.get(CLIENT_HINT_COOKIE)?.value === '1' ? 'client' : cookieStore.get(MEMBER_HINT_COOKIE)?.value === '1' ? 'member' : null;",
    );
    expect(layout).not.toMatch(/'admin'/);
  });

  it('the shell never falls back to admin', () => {
    expect(shell).not.toMatch(/\?\? 'admin'|= 'admin'|: 'admin'\s*[,;)]/);
    expect(shell).toContain("role: 'member' | 'client' | null;");
  });
});

describe('a client gets the client portal and nothing of the owner or member shell', () => {
  it('the gate renders the portal for a client, beside (not inside) the frame', () => {
    expect(shell).toContain('client={<ClientPortal query={probes.client} />}');
  });

  it('a seeded shell asks neither the admin nor the other role probe', () => {
    // /api/shell only when nothing is seeded, the member shell only for a
    // member seed, the client shell only once this is a client.
    expect(shell).toContain('enabled: seed === null,');
    expect(shell).toContain('enabled: isMemberSeed,');
    expect(shell).toContain('enabled: isClient,');
  });
});

describe('the shell renders for a confirmed role only', () => {
  it('everything, providers and frame, sits inside the role gate', () => {
    expect(shell).toMatch(
      /<ViewerRoleProvider role=\{role\}>\s*<ShellRoleGate\s+role=\{role\}\s+probeFailed=\{probeFailed\}\s+failure=\{failure\}\s+retrying=\{retrying\}\s+onRetry=\{retry\}\s+client=\{<ClientPortal query=\{probes\.client\} \/>\}\s*>\s*\{\(confirmed\) => \(\s*<ToastProvider>/,
    );
    expect(shell).toContain('<ShellFrame {...props} role={confirmed} probes={probes} />');
    // One frame, and only there.
    expect(shell.match(/<ShellFrame /g)).toHaveLength(1);
  });

  it('the role comes from the brain through resolveShellRole', () => {
    expect(shell).toContain('const role = resolveShellRole(input);');
    expect(shell).toContain(
      'const { role, probeFailed, failure, retrying, retry, probes } = useShellRole(props.role);',
    );
  });

  it('an offline (paused) probe counts, so the shell does not sit on Loading', () => {
    expect(shell).toContain("paused: shell.fetchStatus === 'paused',");
    expect(shell).toContain('const failure = shellProbeFailure(input, role);');
    expect(shell).toContain('probeFailed: failure !== null,');
  });

  it('no retry on any of the three refusals', () => {
    expect(
      shell.match(/retry: \(count, err\) => !isLoginRefusal\(err\) && count < 1/g),
    ).toHaveLength(3);
  });

  it('a confirmed client clears the member hint, keeps the client hint and navigates nowhere', () => {
    const effect = shell.slice(
      shell.indexOf('const clientConfirmed'),
      shell.indexOf('const shellLoaded'),
    );
    expect(effect).toContain('setMemberHint(false);');
    expect(effect).toContain('setClientHint(true);');
    expect(effect).not.toMatch(/location|router/);
  });
});
