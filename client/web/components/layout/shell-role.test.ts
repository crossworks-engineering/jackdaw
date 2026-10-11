import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { CLIENT_EMPTY_TEXT, RoleSwitch, useShellRole } from './shell-role';

/**
 * The brain's role picks where a screen reads its data (phase W5c, until
 * W6a): the owner screen for an admin, the member view for a member, the
 * plain empty state for a client.
 */
function render(shell: unknown, el: ReturnType<typeof createElement>): string {
  const client = new QueryClient();
  if (shell !== undefined) client.setQueryData(['shell'], shell);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client, children: el }));
}

const OWNER = createElement('p', null, 'OWNER');
const MEMBER = createElement('p', null, 'MEMBER');
const sw = (extra: object = {}) =>
  createElement(RoleSwitch, { member: MEMBER, children: OWNER, ...extra });

describe('RoleSwitch', () => {
  it('the owner screen for an admin, and on a brain that names no role', () => {
    expect(render({ role: 'admin' }, sw())).toBe('<p>OWNER</p>');
    expect(render({ siteName: null }, sw())).toBe('<p>OWNER</p>');
  });

  it('the member view for a member', () => {
    expect(render({ role: 'member' }, sw())).toBe('<p>MEMBER</p>');
  });

  it('the plain empty state for a client, or what the screen gives one', () => {
    const html = render({ role: 'client' }, sw());
    expect(html).toContain(CLIENT_EMPTY_TEXT);
    expect(html).not.toMatch(/OWNER|MEMBER/);
    expect(render({ role: 'client' }, sw({ client: createElement('p', null, 'C') }))).toBe(
      '<p>C</p>',
    );
  });

  it('a role it does not know is a client: never the owner screen', () => {
    expect(render({ role: 'guest' }, sw())).toContain(CLIENT_EMPTY_TEXT);
  });

  it('a spinner, never the owner screen, before the shell has answered', () => {
    const html = render(undefined, sw());
    expect(html).not.toMatch(/OWNER|MEMBER/);
  });
});

describe('useShellRole', () => {
  function Probe() {
    return createElement('p', null, String(useShellRole()));
  }
  it('is null until the shell has answered, then the brain role', () => {
    expect(render(undefined, createElement(Probe))).toBe('<p>null</p>');
    expect(render({ role: 'member' }, createElement(Probe))).toBe('<p>member</p>');
  });
});
