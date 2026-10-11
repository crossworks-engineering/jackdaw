import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '@mantle/web-ui/version';
import { ContractBanner } from './contract-banner';

/** A brain on another wire contract: the banner shows. /settings/updates is
 *  the settings area's, so only a login that holds it gets the link. */
function render(areas: string[] | undefined): string {
  const client = new QueryClient();
  client.setQueryData(['server-version'], {
    version: '9.9.9',
    contractVersion: CONTRACT_VERSION + 1,
  });
  if (areas) client.setQueryData(['shell'], { areas });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client, children: createElement(ContractBanner) }),
  );
}

describe('ContractBanner', () => {
  it('links Settings > Updates for a login with the settings area', () => {
    expect(render(['settings'])).toContain('href="/settings/updates"');
  });

  it('a login without the settings area is told to ask an admin, with no link', () => {
    const html = render([]);
    expect(html).toContain('Needs an update: tell an admin');
    expect(html).not.toContain('/settings/updates');
    expect(html).not.toContain('<a');
  });

  it('shows nothing when the contracts agree', () => {
    const client = new QueryClient();
    client.setQueryData(['server-version'], { contractVersion: CONTRACT_VERSION });
    client.setQueryData(['shell'], { areas: [] });
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client, children: createElement(ContractBanner) }),
    );
    expect(html).toBe('');
  });
});
