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

  it("reads only the row's own level: no /api/shares/all lookup since W5b2 (contract 30)", () => {
    expect(src).toContain(
      'const levelOf = (row: SharedLinkRow): AccessLevel | undefined => row.level;',
    );
    expect(src).not.toContain('/api/shares/all');
    expect(src).not.toContain('LEVELS_FAILED');
  });

  it('a contact share revoke says the workspaces do not change', () => {
    expect(src).toContain('The workspaces do not change.');
    expect(src).not.toMatch(/keeps its\s+level/);
  });

  it('offers Copy only for a link meant to be handed out (never an old client link)', () => {
    expect(src).toMatch(
      /\{canCopyLink\(levelOf\(selected\)\) \? \(\s*<Button[\s\S]*?aria-label="Copy link"/,
    );
    expect(src.match(/aria-label="Copy link"/g)).toHaveLength(1);
  });

  it('confirms a revoke in the shared dialog, saying an old client link stays at Client', () => {
    expect(src).toContain('<RevokeLinkDialog');
    // A contact share (brain migration 0214) says only that contact loses it;
    // an old client link still says it stays at Client.
    expect(src).toMatch(
      /stays: confirmRevoke\.contactId\s*\?[\s\S]*?: isOldClientLink\(levelOf\(confirmRevoke\)\)\s*\? STAYS_AT_CLIENT\s*: null,/,
    );
  });
});
