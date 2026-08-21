'use client';

/**
 * Route-level error boundary — the whole app had NONE, so any render throw
 * fell through to Next's blind "This page couldn't load" 500 with the digest
 * swallowed (the /team/tasks incident: one stray failure blanked the entire
 * workspace with no clue in the UI). This shows the digest so a report can be
 * matched to the server log line, and offers retry instead of a dead end.
 */
import { useEffect } from 'react';
import { Button } from '@mantle/web-ui/ui/button';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">Something went wrong on this screen.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        The rest of the app is fine — try again, or reload the page.
        {error.digest ? ` Error reference: ${error.digest}` : ''}
      </p>
      <Button size="sm" variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
