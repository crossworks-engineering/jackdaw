import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { VERSION_LABEL } from '@mantle/web-ui/version';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const { ChangelogLink } = await import('./changelog-link');

/**
 * The rail's version footer names both halves: Jackdaw (this build, linking
 * to its changelog) and Mantle (the brain, as `/api/version` reports it).
 */
describe('ChangelogLink', () => {
  it('shows the Jackdaw build and the Mantle version, each with its badge', () => {
    const client = new QueryClient();
    client.setQueryData(['server-version'], { version: '9.8.7' });
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client, children: createElement(ChangelogLink) }),
    );
    expect(html).toContain(`Jackdaw ${VERSION_LABEL}`);
    expect(html).toContain('Mantle v9.8.7');
    expect(html).toContain('src="/brand/jackdaw-badge-light.png"');
    expect(html).toContain('src="/brand/mantle-badge.svg"');
  });

  it('keeps the Mantle line, with a placeholder, before the brain answers', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client, children: createElement(ChangelogLink) }),
    );
    expect(html).toMatch(/Mantle (…|unavailable)/);
  });
});
