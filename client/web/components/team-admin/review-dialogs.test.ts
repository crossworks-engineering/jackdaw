import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The accept dialog for a client's item (audit A28), pinned where the node
 * runner cannot render it (it needs the router and the query client). The
 * rules are unit-tested in lib/member-review.test.ts.
 */
const src = readFileSync(fileURLToPath(new URL('./review-dialogs.tsx', import.meta.url)), 'utf8');
const flat = src.replace(/\s+/g, ' ');

describe('the accept dialog, for a client item', () => {
  it('knows who wrote it, and badges the role', () => {
    expect(src).toContain('authorRole={row.author.role}');
    expect(src).toContain('{authorRoleLabel(authorRole)}');
  });

  it("starts a client's item at Team", () => {
    expect(src).toContain('useState<AccessLevel>(() => defaultAcceptLevel(authorRole));');
  });

  it('lists what goes down, one tick each, and Accept waits for all of them', () => {
    expect(flat).toContain('const confirming = !!asked || needsLevelConfirm(authorRole, level);');
    expect(flat).toContain('goingDownAt(bundle.data?.closure, level)');
    expect(flat).toContain(': levelConfirmation(goingDown, ticked)');
    expect(flat).toContain('(confirming && !confirmation)');
    expect(src).toContain('...(confirmation ?? {}),');
    expect(src).toContain('<Checkbox');
  });

  it("shows the brain's 409 confirm-level list instead of failing", () => {
    expect(flat).toMatch(
      /const ask = confirmLevelRefusal\(err\); if \(ask\) \{ .*setRefusal\(\{ level, \.\.\.ask \}\); setTicked\(new Set\(\)\); return; \}/,
    );
  });

  it('starts the ticks over when the level changes', () => {
    expect(flat).toContain(
      'const pickLevel = (v: AccessLevel) => { setLevel(v); setTicked(new Set()); };',
    );
    expect(src).toContain('if (isAccessLevel(v)) pickLevel(v);');
  });
});
