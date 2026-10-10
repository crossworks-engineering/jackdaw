/**
 * A peer's MCP access (W5b2 contract 26): a bound peer acts exactly as its
 * login, so the section has only Acts as. No Write switch, no risky tools.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@mantle/web-ui/ui/toast';
import { PEER_ACTS_AS_TEXT, PeerAccessSection, type PeerAccess } from './peer-access';

function render(access: PeerAccess): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['mcp-logins'], { logins: [] });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(
        ToastProvider,
        null,
        createElement(PeerAccessSection, {
          peerId: 'p1',
          peerName: 'Partner brain',
          access,
          onChanged: () => {},
        }),
      ),
    }),
  );
}

describe('PeerAccessSection', () => {
  it('a bound peer: Acts as and its login rights, no Write, no risky tools', () => {
    const html = render({ actsAsLoginId: 'l1', actsAsRole: 'admin' });
    expect(html).toContain('aria-label="Acts as"');
    expect(html).toContain(PEER_ACTS_AS_TEXT);
    expect(html).not.toContain('aria-label="Allow write"');
    expect(html).not.toMatch(/Risky tools/i);
    expect(html).not.toMatch(/turns Write off/);
  });

  it('a share-only peer says nothing about rights', () => {
    const html = render({ actsAsLoginId: null, actsAsRole: null });
    expect(html).toContain('aria-label="Acts as"');
    expect(html).not.toContain(PEER_ACTS_AS_TEXT);
  });
});
