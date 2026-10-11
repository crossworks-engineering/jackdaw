/**
 * One shell for every login (phase W5c): the areas come from GET /api/shell
 * for everyone, and the admin private rows render for an Admin user only.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { useIsAdminUser, useIsBrainOwner, useViewerAreas } from './use-shell-workspaces';

function render(probe: () => unknown, shell: unknown): string {
  const client = new QueryClient();
  if (shell !== undefined) client.setQueryData(['shell'], shell);
  function Probe() {
    return createElement('p', null, JSON.stringify(probe() ?? 'none'));
  }
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client, children: createElement(Probe) }),
  );
}

const ws = (isAdmin: boolean) => ({
  id: isAdmin ? 'a' : 't',
  name: 'W',
  isAdmin,
  moderator: false,
});

describe('useViewerAreas', () => {
  it('is the shell areas, for every login', () => {
    expect(render(useViewerAreas, { areas: ['users', 'keys'] })).toContain('users');
    expect(render(useViewerAreas, { areas: [] })).toBe('<p>[]</p>');
  });

  it('is undefined (all on) for a brain that names none, and before the shell', () => {
    expect(render(useViewerAreas, { siteName: null })).toBe('<p>&quot;none&quot;</p>');
    expect(render(useViewerAreas, undefined)).toBe('<p>&quot;none&quot;</p>');
  });
});

describe('useIsAdminUser', () => {
  it('is false until the shell has answered', () => {
    expect(render(useIsAdminUser, undefined)).toBe('<p>false</p>');
  });

  it('is true for the admin role, and on a brain that names no role', () => {
    expect(render(useIsAdminUser, { role: 'admin', areas: ['settings'] })).toBe('<p>true</p>');
    expect(render(useIsAdminUser, { siteName: null })).toBe('<p>true</p>');
  });

  it('is false for a member or a client, whatever else the shell holds', () => {
    expect(render(useIsAdminUser, { role: 'member', workspaces: [ws(true)] })).toBe('<p>false</p>');
    expect(render(useIsAdminUser, { role: 'client', areas: ['users'] })).toBe('<p>false</p>');
  });
});

describe('useIsBrainOwner (W6b fix round 2)', () => {
  it('is false until the shell has answered', () => {
    expect(render(useIsBrainOwner, undefined)).toBe('<p>false</p>');
  });

  it('is the brain isOwner: an Admin user who is not the owner is not', () => {
    expect(render(useIsBrainOwner, { role: 'admin', isOwner: true })).toBe('<p>true</p>');
    expect(render(useIsBrainOwner, { role: 'admin', isOwner: false })).toBe('<p>false</p>');
    expect(render(useIsBrainOwner, { role: 'member', isOwner: false })).toBe('<p>false</p>');
  });
});
