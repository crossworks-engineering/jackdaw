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
});
