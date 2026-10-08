/**
 * /settings/mcp picks its screen by role (brain team apps Phase 1): an admin
 * gets the owner screen, a member their own view, and a member never mounts
 * the owner screen (whose requests are admin-only), nor does a client or a
 * role not known yet.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ViewerRoleProvider } from '@/components/member/viewer-role';

vi.mock('./mcp-client', () => ({
  McpSettingsClient: () => createElement('p', null, 'OWNER-MCP-SCREEN'),
}));
vi.mock('./member-mcp-client', () => ({
  MemberMcpClient: () => createElement('p', null, 'MEMBER-MCP-SCREEN'),
}));
vi.mock('@/components/layout/page-title', () => ({ SetPageTitle: () => null }));

async function renderFor(role: unknown): Promise<string> {
  const { default: Page } = await import('./page');
  return renderToStaticMarkup(
    createElement(ViewerRoleProvider, { role: role as 'admin', children: await Page() }),
  );
}

describe('/settings/mcp by role', () => {
  it('an admin gets the owner screen', async () => {
    const html = await renderFor('admin');
    expect(html).toContain('OWNER-MCP-SCREEN');
    expect(html).not.toContain('MEMBER-MCP-SCREEN');
  });

  it('a member gets their own view and never the owner screen', async () => {
    const html = await renderFor('member');
    expect(html).toContain('MEMBER-MCP-SCREEN');
    expect(html).not.toContain('OWNER-MCP-SCREEN');
  });

  it('a client or an unknown role gets neither', async () => {
    for (const role of ['client', null]) {
      const html = await renderFor(role);
      expect(html, String(role)).not.toContain('OWNER-MCP-SCREEN');
      expect(html, String(role)).not.toContain('MEMBER-MCP-SCREEN');
    }
  });
});
