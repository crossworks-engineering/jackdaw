/**
 * /settings/mcp is one screen for every user (workspaces W7b), on the side
 * the login reads: the brain's for an Admin user with Settings, its own for
 * a member. No per-login switch and no Team access list.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./mcp-client', () => ({
  McpSettingsClient: ({ source }: { source: string }) =>
    createElement('p', null, `MCP-SCREEN:${source}`),
}));
vi.mock('@/components/layout/page-title', () => ({ SetPageTitle: () => null }));

async function renderFor(shell: unknown): Promise<string> {
  const { default: Page } = await import('./page');
  const client = new QueryClient();
  client.setQueryData(['shell'], shell);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client, children: await Page() }),
  );
}

describe('/settings/mcp: one screen, on the side the login reads', () => {
  it('an admin with the Settings area reads the brain side', async () => {
    const html = await renderFor({ role: 'admin', areas: ['settings', 'connectors'] });
    expect(html).toContain('MCP-SCREEN:brain');
  });

  it('an admin with only the Settings area reads the brain side', async () => {
    // The brain classes /api/mcp-settings, /api/mcp-clients and
    // /api/mcp-status as `settings` (route-scope.ts), not `connectors`.
    const html = await renderFor({ role: 'admin', areas: ['settings'] });
    expect(html).toContain('MCP-SCREEN:brain');
  });

  it('an admin with only the Connectors area is told so', async () => {
    const html = await renderFor({ role: 'admin', areas: ['connectors'] });
    expect(html).toContain('You cannot manage this part of the brain.');
    expect(html).not.toContain('MCP-SCREEN');
  });

  it('a brain that names no role or areas: the brain side', async () => {
    expect(await renderFor({ siteName: null })).toContain('MCP-SCREEN:brain');
  });

  it('an admin without the Settings area is told so', async () => {
    const html = await renderFor({ role: 'admin', areas: ['users'] });
    expect(html).toContain('You cannot manage this part of the brain.');
    expect(html).not.toContain('MCP-SCREEN');
  });

  it('a member gets the same screen on its own side', async () => {
    const html = await renderFor({ role: 'member', areas: [] });
    expect(html).toContain('MCP-SCREEN:own');
    expect(html).not.toContain('MCP-SCREEN:brain');
  });

  it('a role this build does not know (a brain before W8 naming a client) is a member', async () => {
    const html = await renderFor({ role: 'client', areas: [] });
    expect(html).toContain('MCP-SCREEN:own');
    expect(html).not.toContain('MCP-SCREEN:brain');
  });
});
