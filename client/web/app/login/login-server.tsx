'use client';

import { useEffect, useState } from 'react';
import { currentBrainOrigin } from '@mantle/web-ui/session-registry';

/** The host a person reads as "which brain": `brain.example`, or
 *  `brain.example:8443` off the default port. '' for anything unusable. */
export function brainHostLabel(origin: string | undefined): string {
  if (!origin) return '';
  try {
    return new URL(origin).host;
  } catch {
    return '';
  }
}

/**
 * "Signing in to brain.example", small, under the strapline: the one line on
 * the sign-in screen that says WHICH brain the password is about to go to.
 * Branding says whose brain it is, and two brains can wear the same branding,
 * or none.
 *
 * The server render already knows the brain (`origin`, lib/brain-origin.ts),
 * so the line is right on the first paint. After mount it is re-read from the
 * page's own runtime env, the origin every request on this screen actually
 * goes to: in the desktop shell that is the window's brain as the preload
 * injected it, and on a same-origin deployment with no configured origin it is
 * the page's own host, which the server cannot see.
 */
export function LoginServer({ origin }: { origin?: string }) {
  const [host, setHost] = useState(() => brainHostLabel(origin));
  useEffect(() => {
    const here = brainHostLabel(currentBrainOrigin());
    if (here) setHost(here);
  }, []);
  if (!host) return null;
  return (
    <p data-testid="login-server" className="text-xs text-muted-foreground">
      Signing in to <span className="font-medium text-foreground/80">{host}</span>
    </p>
  );
}
