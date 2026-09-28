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

const box = (level: AccessLevel, share: AccessLinkView | null, canLower = true) =>
  renderToStaticMarkup(
    createElement(AccessLinkBox, {
      level,
      canLower,
      share,
      url: URL_,
      copied: false,
      onCopy: () => {},
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

  it('offers sub-pages only where the link lives (public)', () => {
    expect(src).toMatch(/view\.share &&\s+showsLink\(level\) &&\s+view\.childCount > 0/);
  });

  it("toasts a refused change in the brain's words", () => {
    expect(src).toContain(
      "toast.error(accessErrorMessage(e, 'Could not change who can see this'));",
    );
    expect(src).toContain("toast.error(accessErrorMessage(e, 'Could not change the sub-pages'));");
  });
});
