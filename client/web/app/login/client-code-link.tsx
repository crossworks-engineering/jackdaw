import Link from 'next/link';
// Relative, not '@/': the node test runner renders this
// (client-code-link.test.ts) and does not resolve the app's path alias.
import { CLIENT_SIGNIN_PATH } from '../../lib/client-surface';

/**
 * The way from /login to a client's sign-in (client logins C2b). A client
 * login has no password, so the password form is no use to one; when this
 * brain mails sign-in codes, a quiet line under the form points at them.
 * Nothing at all when it does not: a client there signs in with the link
 * an admin sent, and staff never need the line.
 */
export function ClientCodeLink({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <p className="text-center text-xs text-muted-foreground">
      Client?{' '}
      <Link
        href={CLIENT_SIGNIN_PATH}
        className="text-primary-ink underline-offset-4 hover:underline"
      >
        Sign in with an email code
      </Link>
    </p>
  );
}
