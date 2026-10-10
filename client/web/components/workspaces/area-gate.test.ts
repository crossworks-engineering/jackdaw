/**
 * Settings screens close to a login without their area (W5a, plan 1.4);
 * a brain that names no areas (before W5a) closes nothing.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const path = { current: '/settings/keys' };
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));

const { AreaGate, AREA_REFUSED_TEXT } = await import('./area-gate');

function render(pathname: string, shell: unknown): string {
  path.current = pathname;
  const client = new QueryClient();
  client.setQueryData(['shell'], shell);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(AreaGate, null, createElement('p', null, 'SCREEN')),
    }),
  );
}

describe('AreaGate', () => {
  it('shows the screen with its area', () => {
    expect(render('/settings/keys', { areas: ['keys'] })).toBe('<p>SCREEN</p>');
  });

  it('refuses the screen without it, in plain words', () => {
    const html = render('/settings/keys', { areas: ['settings'] });
    expect(html).not.toContain('SCREEN');
    expect(html).toContain(AREA_REFUSED_TEXT);
  });

  it('never closes the Workspaces list', () => {
    expect(render('/settings/workspaces', { areas: [] })).toBe('<p>SCREEN</p>');
  });

  it('closes nothing on a brain that names no areas', () => {
    expect(render('/settings/users', { siteName: null })).toBe('<p>SCREEN</p>');
  });
});
