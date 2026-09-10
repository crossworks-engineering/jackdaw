import Link from 'next/link';
import { buttonVariants } from '@mantle/web-ui/ui/button';

/**
 * The 404. It renders INSIDE the root layout, so unlike `global-error.tsx` it
 * has the brain's theme, fonts and kit — it should look like part of the app,
 * because a mistyped URL is not a failure of the app.
 *
 * It deliberately does not render the shell (nav, rails): the shell is built by
 * the `(app)` layout, which needs a session, and a 404 is reachable signed out.
 * One link home is the whole affordance.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">That page isn’t here.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        The link may be out of date, or the thing it pointed at may have been moved or deleted.
      </p>
      <Link href="/" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
        Go to the start
      </Link>
    </div>
  );
}
