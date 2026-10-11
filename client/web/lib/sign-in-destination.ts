import { oauthConsentNext } from './oauth-consent';

/**
 * After sign-in (phase W5c: one shell for every login): the brain's MCP
 * consent page when `next` is one (lib/oauth-consent), else `next`, else
 * the home. No shell is asked first: every login lands in the same shell.
 * Async so a caller's `await` and the switch landing (setSwitchLanding)
 * keep their shape.
 */
export async function destinationAfterSignIn(next: string | null | undefined): Promise<string> {
  return oauthConsentNext(next) ?? next ?? '/';
}
