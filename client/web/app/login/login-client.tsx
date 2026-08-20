'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { tokenStore } from '@mantle/web-ui/token-store';
import { LoginForm } from './login-form';

/**
 * Everything on the sign-in screen that has to run in the browser: the
 * already-signed-in bounce, the first-run gate, and the form itself.
 *
 * Split out of `page.tsx` so the page can be a SERVER component and resolve the
 * brain's branding before the HTML is sent — see `login-mark.tsx`. The mark
 * arrives here as a prop rather than being rendered above this component,
 * because it shares one centred block with the strapline: separating them would
 * put the page's 32px rhythm between two lines that belong 8px apart.
 */
export function LoginClient({
  mark,
  next,
  error,
}: {
  /** The server-rendered brand block. A React node, not data — this component
   *  has no business knowing which rung of the branding ladder won. */
  mark: React.ReactNode;
  next?: string;
  error?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (tokenStore.get()) {
      // Re-assert the presence cookie before bouncing. It can be lost while
      // the token survives (an abrupt shutdown can drop Chromium's unflushed
      // cookie store; localStorage flushes eagerly) — and without it the
      // middleware redirects the bounce right back here, a deadlock.
      tokenStore.markPresence();
      router.replace(next ?? '/');
    }
  }, [router, next]);

  const bootQuery = useQuery({
    queryKey: ['auth-bootstrap-state'],
    queryFn: () => apiFetch<{ firstRun: boolean }>('/api/auth/bootstrap-state'),
  });
  const firstRun = bootQuery.data?.firstRun ?? false;

  return (
    <>
      <div className="space-y-2 text-center">
        {mark}
        <p className="text-sm text-muted-foreground">
          {firstRun ? 'Create your login to begin.' : 'Sign in to your tree.'}
        </p>
      </div>
      <LoginForm mode={firstRun ? 'signup' : 'login'} next={next} error={error} />
    </>
  );
}
