import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AccessLevel, AccessLinkView } from '@mantle/client-types';
import { AccessLinkBox } from './access-link-box';

/**
 * The Access control's link part (client logins C1): public is the only
 * level with an open link, so the link box and Copy show at Public and
 * nowhere else. At Client there is no link box, whatever the brain holds.
 */
const SHARE: AccessLinkView = {
  id: 's1',
  token: 'tok123',
  path: '/s/tok123',
  mode: 'public',
  cascade: false,
};
const URL_ = 'https://brain.example/s/tok123';

const box = (
  level: AccessLevel,
  share: AccessLinkView | null,
  canLower = true,
  extra: { open?: AccessLevel[]; onRevoke?: () => void } = {},
) =>
  renderToStaticMarkup(
    createElement(AccessLinkBox, {
      level,
      canLower,
      share,
      url: URL_,
      copied: false,
      onCopy: () => {},
      ...extra,
    }),
  );

describe('AccessLinkBox', () => {
  it('shows the link and Copy at Public', () => {
    const html = box('public', SHARE);
    expect(html).toContain('aria-label="Copy link"');
    expect(html).toContain(`value="${URL_}"`);
  });

  it('says Public has no link yet when there is none', () => {
    expect(box('public', null)).toContain('This item has no link.');
  });

  it('shows no link box and no Copy at Client', () => {
    for (const share of [null, SHARE]) {
      const html = box('client', share);
      expect(html).not.toContain('Copy link');
      expect(html).not.toContain(URL_);
      expect(html).not.toContain('<input');
      expect(html).not.toContain('This item has no link.');
    }
  });

  it('names an old client link, without offering it', () => {
    const html = box('client', SHARE);
    expect(html).toContain('Old client link: clients will sign in instead');
    expect(box('client', null)).toBe('');
  });

  it('offers to revoke an old client link on the item itself, which stays at Client', () => {
    const html = box('client', SHARE, true, { onRevoke: () => {} });
    expect(html).toContain('Revoke link (stays at Client)');
    expect(html).toContain('It still opens until it is revoked.');
    expect(html).not.toContain('Copy link');
    // No link, nothing to revoke.
    expect(box('client', null, true, { onRevoke: () => {} })).toBe('');
  });

  it('a brain before C1 (client makes a link there): the link and Copy at Client', () => {
    const html = box('client', SHARE, true, { open: ['client', 'public'] });
    expect(html).toContain('aria-label="Copy link"');
    expect(html).not.toContain('Old client link');
  });

  it('shows nothing at Team or Admin, or for a kind that stays admin', () => {
    expect(box('team', null)).toBe('');
    expect(box('admin', null)).toBe('');
    expect(box('public', SHARE, false)).toBe('');
  });
});

describe('the Access control uses it', () => {
  const src = readFileSync(fileURLToPath(new URL('./access-control.tsx', import.meta.url)), 'utf8');

  it('renders its link part through AccessLinkBox only', () => {
    expect(src).toMatch(/<AccessLinkBox\s+level=\{level\}/);
    // No second link box beside it.
    expect(src).not.toContain('aria-label="Copy link"');
    expect(src).not.toContain('<Input');
  });

  it('feature-detects a brain before C1 by openLinkLevels', () => {
    expect(src).toContain('const openLevels = view ? openLinkLevelsOf(view) : [];');
    expect(src).toContain('open={openLevels}');
    expect(src.replace(/\s+/g, ' ')).toContain(
      'levelMeaning(picked, { open: openLevels, oldLink: picked === level && oldOwnLink, })',
    );
  });

  it('revokes old client links in the Shared links dialog, outside the popover', () => {
    const after = src.slice(src.indexOf('</PopoverContent>'));
    expect(after).toMatch(/<\/Popover>\s*<RevokeLinkDialog/);
    expect(src).toContain('await revokeShareLink(target.shareId);');
    expect(src).toContain('stays: STAYS_AT_CLIENT,');
  });

  it('names an old link above a client item, with Shared links and a revoke', () => {
    expect(src).toContain(
      "const oldLinksAbove = level === 'client' ? (view?.oldLinksAbove ?? []) : [];",
    );
    expect(src).toMatch(
      /\{oldLinksAbove\.length > 0 && \(\s*<div[^>]*>\s*\{oldLinksAbove\.map\(\(l\) => \(/,
    );
    expect(src).toContain('{oldLinkAboveLine(l)}: anyone with that link can open this item.');
    expect(src).toContain('<Link href={sharedLinkHref(l.shareId)}>Shared links</Link>');
    expect(src).toContain('Revoke that link');
  });

  it('a level change reloads Shared links and its levels', () => {
    const refresh = src.slice(src.indexOf('const refreshScreens'), src.indexOf('const askRevoke'));
    expect(refresh).toContain('invalidateLinkQueries(queryClient);');
  });

  it("toasts a refused change in the brain's words", () => {
    expect(src).toContain(
      "toast.error(accessErrorMessage(e, 'Could not change who can see this'));",
    );
  });
});
