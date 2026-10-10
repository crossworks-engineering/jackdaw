/**
 * The workspace switcher (W5a): it lists the login's workspaces (All first,
 * Admin next, then by name, Moderator ones marked), its button names the
 * current one, and it renders nothing for a brain that sends no workspaces.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ALL_WORKSPACES, ALL_WORKSPACES_LABEL } from '@/lib/workspaces';
import { WorkspaceSwitcher, WorkspaceSwitcherView, switcherOptions } from './workspace-switcher';

const WORKSPACES = [
  { id: 't', name: 'Team', isAdmin: false, moderator: true },
  { id: 's', name: 'Sales', isAdmin: false, moderator: false },
  { id: 'a', name: 'Admin', isAdmin: true, moderator: true },
];

function withShell(shell: unknown, el: React.ReactElement): string {
  const client = new QueryClient();
  if (shell !== undefined) client.setQueryData(['shell'], shell);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client, children: el }));
}

describe('switcherOptions', () => {
  it('All first, then Admin, then by name; Moderator ones marked', () => {
    expect(switcherOptions(WORKSPACES)).toEqual([
      { value: ALL_WORKSPACES, label: ALL_WORKSPACES_LABEL, hint: null },
      { value: 'a', label: 'Admin', hint: 'Moderator' },
      { value: 's', label: 'Sales', hint: null },
      { value: 't', label: 'Team', hint: 'Moderator' },
    ]);
  });
});

describe('WorkspaceSwitcherView', () => {
  it('the rail button names the current workspace', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSwitcherView, {
        variant: 'rail',
        workspaces: WORKSPACES,
        current: 't',
        onChange: () => {},
      }),
    );
    expect(html).toContain('aria-label="Workspace: Team"');
    expect(html).toContain('>Team</span>');
  });

  it('says All my workspaces when nothing is picked', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSwitcherView, {
        variant: 'bar',
        workspaces: WORKSPACES,
        current: ALL_WORKSPACES,
        onChange: () => {},
      }),
    );
    expect(html).toContain(`aria-label="Workspace: ${ALL_WORKSPACES_LABEL}"`);
  });
});

describe('WorkspaceSwitcher', () => {
  it('renders nothing for a brain that sends no workspaces', () => {
    expect(withShell({ siteName: null }, createElement(WorkspaceSwitcher))).toBe('');
  });

  it('renders nothing before the shell answers', () => {
    expect(withShell(undefined, createElement(WorkspaceSwitcher))).toBe('');
  });

  it('renders the switcher from the shell, on All while nothing is stored', () => {
    const html = withShell(
      { workspaces: WORKSPACES, areas: ['users'], email: 'a@x.test' },
      createElement(WorkspaceSwitcher),
    );
    expect(html).toContain(`aria-label="Workspace: ${ALL_WORKSPACES_LABEL}"`);
  });

  it('renders for a login in no workspaces (the list is empty, not absent)', () => {
    const html = withShell({ workspaces: [] }, createElement(WorkspaceSwitcher));
    expect(html).toContain('Workspace:');
  });
});
