/**
 * A member never gets an Admin area on the workspaces screens (W5a): the
 * member shell has no /api/shell, and "no areas named" must not read as
 * "all areas on" there. Members may open the Workspaces screen.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ViewerRoleProvider } from '@/components/member/viewer-role';
import { memberMayOpen } from '@/lib/member-surface';
import { MEMBER_NAV } from '@/lib/member-nav';
import { useViewerAreas } from './use-shell-workspaces';

function Probe() {
  return createElement('p', null, JSON.stringify(useViewerAreas() ?? 'none'));
}

function areasFor(role: 'admin' | 'member', shell: unknown): string {
  const client = new QueryClient();
  if (shell !== undefined) client.setQueryData(['shell'], shell);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(ViewerRoleProvider, { role, children: createElement(Probe) }),
    }),
  );
}

describe('useViewerAreas', () => {
  it('a member has no areas, whatever the cache holds', () => {
    expect(areasFor('member', undefined)).toBe('<p>[]</p>');
    expect(areasFor('member', { areas: ['users'] })).toBe('<p>[]</p>');
  });

  it('an admin has the shell areas', () => {
    expect(areasFor('admin', { areas: ['users', 'keys'] })).toContain('users');
    expect(areasFor('admin', { siteName: null })).toBe('<p>&quot;none&quot;</p>');
  });
});

describe('members and the Workspaces screen', () => {
  it('a member may open it, and finds it in their nav', () => {
    expect(memberMayOpen('/settings/workspaces')).toBe(true);
    expect(memberMayOpen('/settings/users')).toBe(false);
    expect(MEMBER_NAV.flatMap((g) => g.items).map((i) => i.href)).toContain('/settings/workspaces');
  });
});
