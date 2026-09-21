'use client';

import { useEffect, useState } from 'react';
import { destinationAfterSignIn } from '@/lib/member-destination';
import { useRouter } from 'next/navigation';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Input } from '@mantle/web-ui/ui/input';
import { SecretInput } from '@mantle/web-ui/ui/secret-input';
import { Label } from '@mantle/web-ui/ui/label';
import { apiUrl, resetCookieUpgrade, upgradeOwnerCookie } from '@mantle/web-ui/api-fetch';
import { isCrossOrigin } from '@mantle/web-ui/runtime-env';
import { tokenStore } from '@mantle/web-ui/token-store';
import { UNEXPECTED_RESPONSE, readBearer, signInErrorMessage } from '@/lib/sign-in-error';
import { SetupCodeField, isSetupCodeRefusal } from './setup-code-field';

/**
 * Owner sign-in. One transport in both topologies: POST /api/auth/token, and
 * the response bearer is held as a session of its own (the token store, which
 * also sets the presence cookie for the client middleware). A device can hold
 * several logins, and a login that is a bearer can be switched to by swapping
 * a token; one that is a cookie cannot.
 *
 *   split (the API is on another origin): that is all. No cross-origin
 *     cookies anywhere.
 *
 *   same-origin (single-host deploys, local dev): the browser-native loaders
 *     (`<img>`, `<iframe>`, download anchors) can only send a cookie, so the
 *     bearer is traded for one straight away (POST /api/auth/sso, the same
 *     upgrade the shell runs on every load) and the navigation waits for it.
 *     A box signed in bearer-only and holding no cookie is the bug that
 *     upgrade was written for.
 *
 * The topology test is a REAL origin comparison (`isCrossOrigin`), not
 * `apiBase set`, which is true on every same-origin box that configures one.
 *
 * Signup (first-run) creates the account first, then exchanges the same
 * credentials for a bearer like any other sign-in. A brain the installer set
 * up asks for its setup code too (`setupCodeRequired`); a setup-code refusal
 * shows on that field.
 */
export function LoginForm({
  mode = 'login',
  next,
  error: initialError,
  setupCodeRequired = false,
  add = false,
  initialEmail,
}: {
  mode?: 'login' | 'signup';
  next?: string;
  error?: string;
  /** First-run signup asks for the installer's setup code. */
  setupCodeRequired?: boolean;
  /** Someone already signed in is adding (or signing back in to) a login. */
  add?: boolean;
  /** The login being signed back in to. Arrives after mount, from the device's
   *  own list, so it fills the field once rather than seeding the state. */
  initialEmail?: string;
}) {
  const router = useRouter();
  const isSignup = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  // Shown when the brain says so, or when it refuses a signup for the code
  // (a bootstrap state that had not loaded yet must not hide the field).
  const [codeRefused, setCodeRefused] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>();
  const askCode = isSignup && (setupCodeRequired || codeRefused);
  const [error, setError] = useState<string | undefined>(initialError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialEmail) setEmail((current) => current || initialEmail);
  }, [initialEmail]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setCodeError(undefined);
    try {
      const split = isCrossOrigin();

      if (isSignup) {
        const res = await fetch(apiUrl('/api/auth/signup'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(askCode ? { email, password, setupCode } : { email, password }),
          credentials: split ? 'omit' : 'include',
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
          if (isSetupCodeRefusal(res.status, data)) {
            setCodeRefused(true);
            setCodeError(data.error ?? 'Enter the setup code the installer printed.');
            return;
          }
          setError(data.error ?? 'Could not create your login.');
          return;
        }
      }

      const res = await fetch(apiUrl('/api/auth/token'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, deviceName: 'Web client' }),
        credentials: split ? 'omit' : 'include',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Sign-in failed.');
        return;
      }
      const token = await readBearer(res);
      if (!token) {
        setError(UNEXPECTED_RESPONSE);
        return;
      }
      tokenStore.signIn({ email, token });
      if (!split) {
        // The upgrade resolves a cookie BEFORE a bearer, so a cookie left by
        // another login (a sign-out that never reached the brain) would be
        // renewed instead of replaced, and assets would load as that person.
        // Drop it first. Sent without the bearer: this revokes nothing. Not
        // after a signup, whose cookie is this very login's.
        if (!isSignup) {
          await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' }).catch(
            () => undefined,
          );
        }
        // Whatever an earlier visit to this tab memoised is about someone
        // else's session; this one has not been upgraded yet.
        resetCookieUpgrade();
        await upgradeOwnerCookie();
      }

      if (add) {
        // This tab has been someone else until now: its query cache, asset
        // token and mounted providers are all theirs. A client navigation
        // would carry that heap into the new login (sign-out.ts tells the
        // story); a page load is the guarantee. The destination is the one any
        // sign-in gets, so the role hints describe the login just added.
        window.location.assign(await destinationAfterSignIn(next));
        return;
      }

      // New accounts go straight into onboarding; returning users to where
      // they were headed (AppShell redirects to /onboarding if not yet done).
      router.push(isSignup ? '/onboarding' : await destinationAfterSignIn(next));
      router.refresh();
    } catch (err) {
      setError(signInErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <SecretInput
          id="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {askCode && (
        <SetupCodeField
          value={setupCode}
          onChange={(v) => {
            setSetupCode(v);
            setCodeError(undefined);
          }}
          error={codeError}
        />
      )}
      {error && <p className="text-sm text-destructive-ink">{error}</p>}
      <SubmitButton pending={busy} className="w-full">
        {isSignup ? 'Create login' : 'Sign in'}
      </SubmitButton>
    </form>
  );
}
