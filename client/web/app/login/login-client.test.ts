import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));

const { LoginClient } = await import('./login-client');

/**
 * The sign-in page's way in by email code (plan 15: for any login without a
 * password): a quiet link under the password form, shown only when the
 * brain sends codes, and never on the first run or while adding a login.
 * No Staff / Client choice any more (W5c).
 */
function render(props: { emailCodes?: boolean; add?: boolean; firstRun?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['auth-bootstrap-state'], { firstRun: props.firstRun ?? false });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(LoginClient, {
        mark: null,
        emailCodes: props.emailCodes,
        add: props.add,
      }),
    }),
  );
}

const LINK = 'Sign in with an email code';

describe('LoginClient and sign-in by email code', () => {
  it('offers the code under the password form when the brain sends codes', () => {
    const html = render({ emailCodes: true });
    expect(html).toContain(LINK);
    expect(html).toContain('id="password"');
    expect(html.indexOf('id="password"')).toBeLessThan(html.indexOf(LINK));
  });

  it('offers nothing when the brain sends no codes', () => {
    expect(render({ emailCodes: false })).not.toContain(LINK);
    expect(render({})).not.toContain(LINK);
  });

  it('not while adding a login, and not on the first run', () => {
    expect(render({ emailCodes: true, add: true })).not.toContain(LINK);
    expect(render({ emailCodes: true, firstRun: true })).not.toContain(LINK);
  });

  it('has no Staff / Client choice and names no tier', () => {
    for (const html of [render({ emailCodes: true }), render({ emailCodes: true, add: true })]) {
      expect(html).not.toMatch(/Staff login|Client login|client/i);
    }
  });
});
