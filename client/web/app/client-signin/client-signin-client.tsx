'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@mantle/web-ui/api-fetch';
import { isCrossOrigin } from '@mantle/web-ui/runtime-env';
import { tokenStore } from '@mantle/web-ui/token-store';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@mantle/web-ui/ui/field';
import { Input } from '@mantle/web-ui/ui/input';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
// Relative, not '@/': the node test runner renders this
// (client-signin-client.test.ts) and does not resolve the app's path alias.
import { setClientHint, setMemberHint } from '../../lib/member-destination';
import { urlWithoutInviteCode } from '../../lib/member-invites';
import { clientEmailError, clientSignInOutcome, readClientCode } from '../../lib/client-portal';
import { CLIENT_LINK_LIFETIME_HOURS } from '../../lib/client-logins';
import { signInErrorMessage } from '../../lib/sign-in-error';

/**
 * The browser half of /client-signin (client logins C2). Two complete states
 * and nothing between them: with the link's code, the email check and Sign
 * in; without one, how a client gets in (their link) and the way to staff
 * sign-in. The code is read once and leaves the address bar (and so the
 * history); the email is a check the brain makes, not a choice.
 *
 * Signing in sets the 30-day session cookie on the answer (same origin: a
 * client never holds a bearer), the presence cookie and the client hint,
 * then loads the client home with a full navigation, so nothing an earlier
 * session cached on this tab survives.
 */
export function ClientSigninClient({
  mark,
  initialCode,
}: {
  mark: React.ReactNode;
  initialCode: string;
}) {
  const [code] = useState(() => readClientCode(initialCode));
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const clean = urlWithoutInviteCode(window.location.href);
    if (clean !== null) window.history.replaceState(window.history.state, '', clean);
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const err = clientEmailError(email);
    setEmailError(err ?? undefined);
    setFormError(undefined);
    if (err) {
      document.getElementById('client-email')?.focus();
      return;
    }
    setPending(true);
    try {
      // RAW fetch, never apiFetch: a link that signs nobody in is a 401
      // here, which apiFetch would turn into a trip to /login.
      const res = await fetch(apiUrl('/api/auth/client-link'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, email: email.trim() }),
        credentials: isCrossOrigin() ? 'omit' : 'include',
      });
      const outcome = clientSignInOutcome(res.status, await res.json().catch(() => null));
      if (outcome.kind !== 'ok') {
        setFormError(outcome.message);
        return;
      }
      // A bearer left by an earlier session on this browser would ride along
      // with every request; the new cookie is the session now.
      tokenStore.clear();
      tokenStore.markPresence();
      setMemberHint(false);
      setClientHint(true);
      window.location.assign('/');
    } catch (err) {
      setFormError(signInErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const staffSignIn = () => {
    // Staff on a browser a client used: the hint would send /login back here.
    setClientHint(false);
    window.location.assign('/login');
  };

  return (
    // The settings-card shell (ui-style-guide §6e), as /login wears it.
    <section className="rounded-xl border border-border bg-card">
      <div className="space-y-2 border-b border-border p-4 text-center md:p-5">
        {mark}
        <p className="text-sm text-muted-foreground">
          {code ? 'Enter your email to sign in.' : 'Sign in with the link you were sent.'}
        </p>
      </div>
      <div className="p-4 md:p-5">
        {code ? (
          <form onSubmit={signIn} noValidate>
            <FieldGroup>
              <Field data-invalid={!!emailError || undefined}>
                <FieldLabel htmlFor="client-email">Email</FieldLabel>
                <Input
                  id="client-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  aria-invalid={!!emailError || undefined}
                  aria-describedby={
                    emailError ? 'client-email-error client-email-hint' : 'client-email-hint'
                  }
                />
                <FieldDescription id="client-email-hint">
                  The email this link was made for.
                </FieldDescription>
                <FieldError id="client-email-error">{emailError}</FieldError>
              </Field>
              <FieldError id="client-signin-error">{formError}</FieldError>
              <SubmitButton pending={pending} className="w-full">
                Sign in
              </SubmitButton>
            </FieldGroup>
          </form>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Open the sign-in link you were sent. A link works once, for{' '}
              {CLIENT_LINK_LIFETIME_HOURS} hours; if yours has been used or has expired, ask for a
              new one.
            </p>
            <div className="text-center">
              <Button type="button" variant="link" size="sm" onClick={staffSignIn}>
                Staff sign in
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
