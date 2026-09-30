'use client';

import { useLayoutEffect, useState } from 'react';
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
import { takeLinkCode } from '../../lib/link-code';
import {
  CLIENT_SIGNIN_UNAVAILABLE,
  clientEmailError,
  clientSignInOutcome,
  readClientCode,
} from '../../lib/client-portal';
import { CLIENT_LINK_LIFETIME_HOURS } from '../../lib/client-logins';
import { signInErrorMessage } from '../../lib/sign-in-error';
import { ClientCodeForm } from './client-code-form';

/** What the page offers: the link's email check, sign-in by an emailed code
 *  (C2b), or neither (how to get a link). */
type ClientSigninMode = 'link' | 'code' | 'none';

/** The first state: the link when there is one, else a code when this brain
 *  sends codes, else how to get a link. */
export function clientSigninMode(code: string, codesEnabled: boolean): ClientSigninMode {
  if (code) return 'link';
  return codesEnabled ? 'code' : 'none';
}

const STRAPLINE: Record<ClientSigninMode, string> = {
  link: 'Enter your email to sign in.',
  code: 'Sign in with a code sent to your email.',
  none: 'Sign in with the link you were sent.',
};

/**
 * The browser half of /client-signin (client logins C2, C2b). Complete
 * states and nothing between them: with the link's code, the email check
 * and Sign in; without one, sign-in by an emailed code when this brain
 * sends codes (`codesEnabled`, asked on the server), else how a client gets
 * in (their link). Staff sign-in is offered whenever there is no link. The
 * code comes in the link's fragment (`#code=`), or its query for links
 * issued before; it is read once and leaves the address bar (and so the
 * history) at once (lib/link-code.ts); the email is a check the brain
 * makes, not a choice. On a split-origin setup no form shows and nothing is
 * posted (CLIENT_SIGNIN_UNAVAILABLE).
 *
 * Signing in (by link or by code) sets the 30-day session cookie on the
 * answer (same origin: a client never holds a bearer), the presence cookie
 * and the client hint, then loads the client home with a full navigation,
 * so nothing an earlier session cached on this tab survives.
 */
export function ClientSigninClient({
  mark,
  initialCode,
  codesEnabled,
  initialSplit = false,
}: {
  mark: React.ReactNode;
  /** A link's code from the query (links issued before the fragment). */
  initialCode: string;
  codesEnabled: boolean;
  /** Tests only: render as a split-origin setup. The page finds out itself. */
  initialSplit?: boolean;
}) {
  const [code, setCode] = useState(() => readClientCode(initialCode));
  const [mode, setMode] = useState(() => clientSigninMode(code, codesEnabled));
  const [split, setSplit] = useState(initialSplit);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  // Before the first paint: the link's code (the inline script took it out
  // of the address already), and whether this is a split-origin setup.
  useLayoutEffect(() => {
    const taken = readClientCode(takeLinkCode(window, document.documentElement));
    if (taken) {
      setCode(taken);
      setMode('link');
    }
    if (isCrossOrigin()) setSplit(true);
  }, []);

  const signedIn = () => {
    // A bearer left by an earlier session on this browser would ride along
    // with every request; the new cookie is the session now.
    tokenStore.clear();
    tokenStore.markPresence();
    setMemberHint(false);
    setClientHint(true);
    window.location.assign('/');
  };

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const err = clientEmailError(email);
    setEmailError(err ?? undefined);
    setFormError(undefined);
    if (err) {
      document.getElementById('client-email')?.focus();
      return;
    }
    // Never posted from another origin: it would spend the link for nothing.
    if (isCrossOrigin()) {
      setSplit(true);
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
        credentials: 'include',
      });
      const outcome = clientSignInOutcome(res.status, await res.json().catch(() => null));
      if (outcome.kind !== 'ok') {
        setFormError(outcome.message);
        return;
      }
      signedIn();
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
        {split ? null : <p className="text-sm text-muted-foreground">{STRAPLINE[mode]}</p>}
      </div>
      <div
        className="p-4 md:p-5"
        // Hidden while the inline script holds a link's code this render has
        // not read yet: no flash of "ask for a link" before the link's form.
        data-link-code-wait={mode === 'link' ? undefined : ''}
      >
        {split ? (
          <div className="space-y-4 text-sm">
            <p role="status" className="text-muted-foreground" data-testid="client-signin-split">
              {CLIENT_SIGNIN_UNAVAILABLE}
            </p>
            <div className="text-center">
              <Button type="button" variant="link" size="sm" onClick={staffSignIn}>
                Staff sign in
              </Button>
            </div>
          </div>
        ) : mode === 'link' ? (
          <div className="space-y-4">
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
            {codesEnabled ? (
              <div className="text-center">
                <Button type="button" variant="link" size="sm" onClick={() => setMode('code')}>
                  Sign in with an email code instead
                </Button>
              </div>
            ) : null}
          </div>
        ) : mode === 'code' ? (
          <div className="space-y-4">
            <ClientCodeForm onSignedIn={signedIn} />
            <p className="text-center text-xs text-muted-foreground">
              Were you sent a sign-in link? Open it instead.
            </p>
            <div className="text-center">
              <Button type="button" variant="link" size="sm" onClick={staffSignIn}>
                Staff sign in
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Open the sign-in link you were sent. A link works once, for{' '}
              {CLIENT_LINK_LIFETIME_HOURS} hours. If you have no link, or yours has been used or has
              expired, ask the team for a new one.
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
