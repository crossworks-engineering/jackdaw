import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));

const { LoginClient } = await import('./login-client');

/**
 * The sign-in page is a password sign-in, nothing else (workspaces W8: no
 * client login and no sign-in by email code; the brain answers the code
 * routes 410). No Staff / Client choice either (W5c).
 */
function render(props: { add?: boolean; firstRun?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['auth-bootstrap-state'], { firstRun: props.firstRun ?? false });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(LoginClient, { mark: null, add: props.add }),
    }),
  );
}

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('LoginClient, password only (W8)', () => {
  it('shows the password form, and no email code way in', () => {
    for (const html of [render({}), render({ add: true }), render({ firstRun: true })]) {
      expect(html).toContain('id="password"');
      expect(html).not.toMatch(/email code/i);
    }
  });

  it('has no Staff / Client choice and names no tier', () => {
    for (const html of [render({}), render({ add: true })]) {
      expect(html).not.toMatch(/Staff login|Client login|client/i);
    }
  });

  it('the page asks the brain nothing about codes', () => {
    const page = read('./page.tsx');
    expect(page).not.toMatch(/emailCode|email-code/);
  });
});
