import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AccessLevel } from '@mantle/client-types';
import { LinkLevel } from './link-level';

/**
 * A shared link's level (client logins C1): shown beside each link; a live
 * link on a client item is marked as an old client link; an older brain
 * that sends no level gets nothing extra.
 */
const level = (l: AccessLevel | undefined) =>
  renderToStaticMarkup(createElement(LinkLevel, { level: l }));
const OLD = 'Old client link: clients will sign in instead';

describe('LinkLevel', () => {
  it('shows the level of a public link, with no old-link mark', () => {
    const html = level('public');
    expect(html).toContain('Public');
    expect(html).not.toContain(OLD);
  });

  it('marks a live link on a client item as an old client link', () => {
    const html = level('client');
    expect(html).toContain('Client');
    expect(html).toContain(OLD);
  });

  it('shows nothing extra when the brain sends no level', () => {
    expect(level(undefined)).toBe('');
  });

  it('names a live link on an admin item an old open link', () => {
    const html = level('admin');
    expect(html).toContain('Admin (old open link)');
    expect(html).not.toContain(OLD);
  });
});

describe('the Shared links panel shows it', () => {
  const src = readFileSync(
    fileURLToPath(new URL('./shared-links-panel.tsx', import.meta.url)),
    'utf8',
  );

  it('on every card and in the selected link header', () => {
    expect(src).toContain('<LinkLevel level={levelOf(row)} />');
    expect(src).toContain('<LinkLevel level={levelOf(selected)} />');
  });

  it("takes the row's own level first, else the level from /api/shares/all", () => {
    expect(src).toContain('row.level ?? levels.get(row.id)');
    expect(src).toContain("apiFetch<{ shares: AllSharesRow[] }>('/api/shares/all')");
  });

  it('asks /api/shares/all only when a row came without its level', () => {
    expect(src).toContain('const lookup = needsLevelLookup(rows);');
    expect(src).toMatch(/queryKey: SHARE_LEVELS_KEY,\n[^\n]*\n\s*enabled: lookup,/);
  });

  it('says so when the levels failed, with Retry, instead of dropping the badges', () => {
    expect(src).toContain('const levelsFailed = lookup && levelsQuery.isError;');
    expect(src).toMatch(/\{levelsFailed \? \(\s*<p\s+role="status"[\s\S]*?\{LEVELS_FAILED\}/);
    expect(src).toContain('onClick={() => void levelsQuery.refetch()}');
  });

  it('reloads the levels after a revoke', () => {
    const revoke = src.slice(
      src.indexOf('const revoke = async'),
      src.indexOf('if (rows.length === 0)'),
    );
    expect(revoke).toContain('void queryClient.invalidateQueries({ queryKey: SHARE_LEVELS_KEY });');
  });

  it('offers Copy only for a link meant to be handed out (never an old client link)', () => {
    expect(src).toMatch(
      /\{canCopyLink\(levelOf\(selected\)\) \? \(\s*<Button[\s\S]*?aria-label="Copy link"/,
    );
    expect(src.match(/aria-label="Copy link"/g)).toHaveLength(1);
  });

  it('confirms a revoke in the shared dialog, saying an old client link stays at Client', () => {
    expect(src).toContain('<RevokeLinkDialog');
    expect(src).toContain(
      'stays: isOldClientLink(levelOf(confirmRevoke)) ? STAYS_AT_CLIENT : null,',
    );
  });
});
