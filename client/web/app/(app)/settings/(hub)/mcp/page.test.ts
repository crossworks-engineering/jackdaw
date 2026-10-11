/**
 * /settings/mcp picks its screen by the brain's role and the areas (phase
 * W5c): the brain's screen for an admin with Connectors, the member's own
 * view for a member, nothing of either for a client.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./mcp-client', () => ({
  McpSettingsClient: () => createElement('p', null, 'OWNER-MCP-SCREEN'),
}));
vi.mock('./member-mcp-client', () => ({
  MemberMcpClient: () => createElement('p', null, 'MEMBER-MCP-SCREEN'),
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

describe('/settings/mcp by role and area', () => {
  it('an admin with the Connectors area gets the brain screen', async () => {
    const html = await renderFor({ role: 'admin', areas: ['connectors'] });
    expect(html).toContain('OWNER-MCP-SCREEN');
    expect(html).not.toContain('MEMBER-MCP-SCREEN');
  });

  it('a brain that names no role or areas: the brain screen', async () => {
    expect(await renderFor({ siteName: null })).toContain('OWNER-MCP-SCREEN');
  });

  it('an admin without the Connectors area is told so, with neither screen', async () => {
    const html = await renderFor({ role: 'admin', areas: ['settings'] });
    expect(html).toContain('You cannot manage this part of the brain.');
    expect(html).not.toMatch(/OWNER-MCP-SCREEN|MEMBER-MCP-SCREEN/);
  });

  it('a member gets its own view and never the brain screen', async () => {
    const html = await renderFor({ role: 'member', areas: [] });
    expect(html).toContain('MEMBER-MCP-SCREEN');
    expect(html).not.toContain('OWNER-MCP-SCREEN');
  });

  it('a client gets neither', async () => {
    const html = await renderFor({ role: 'client', areas: [] });
    expect(html).not.toMatch(/OWNER-MCP-SCREEN|MEMBER-MCP-SCREEN/);
  });
});
