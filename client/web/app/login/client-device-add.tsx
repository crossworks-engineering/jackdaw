'use client';

import { useEffect, useState } from 'react';
import { tokenStore } from '@mantle/web-ui/token-store';
import { ClientCodeFormView, type ClientCodeStep } from '../client-signin/client-code-form';
import { clientCodeError } from '../../lib/client-code';
import { clientEmailError } from '../../lib/client-portal';
import { askDeviceCode, verifyDeviceCode } from '../../lib/client-device-signin';
import { destinationAfterSignIn } from '../../lib/member-destination';
import { signInErrorMessage } from '../../lib/sign-in-error';

/**
 * Add a CLIENT login to the logins this desktop window holds (desktop only,
 * see lib/client-device-signin.ts): the email, then the emailed code, traded
 * for the client login's own bearer. It is held like any other login (the
 * OS-keychain vault, one slot per login) with its role, and becomes the
 * active one. The page load after it lands on the client surface: the
 * after-sign-in destination asks the brain with the new bearer and sets the
 * client hint. Nothing else held here is touched.
 */
export function ClientDeviceAdd({ initialEmail }: { initialEmail?: string }) {
  const [step, setStep] = useState<ClientCodeStep>('email');
  const [email, setEmail] = useState('');
  // A held client login being signed back in to: its email, once it is known.
  useEffect(() => {
    if (initialEmail) setEmail((current) => current || initialEmail);
  }, [initialEmail]);
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  async function ask(again: boolean) {
    setPending(true);
    setFormError(undefined);
    setCodeError(undefined);
    try {
      const asked = await askDeviceCode(email, again ? requestId : undefined);
      if (asked.kind !== 'sent') {
        setFormError(asked.message);
        return;
      }
      setRequestId(asked.requestId);
      setCode('');
      setResent(again);
      setStep('code');
    } catch (err) {
      setFormError(signInErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function request(e: React.FormEvent) {
    e.preventDefault();
    const err = clientEmailError(email);
    setEmailError(err ?? undefined);
    setFormError(undefined);
    if (err) {
      document.getElementById('client-code-email')?.focus();
      return;
    }
    void ask(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const err = clientCodeError(code);
    setCodeError(err ?? undefined);
    setFormError(undefined);
    if (err || !requestId) {
      document.getElementById('client-code')?.focus();
      return;
    }
    setPending(true);
    try {
      const out = await verifyDeviceCode({ email, code, requestId });
      if (out.kind === 'ok') {
        tokenStore.signIn({
          email: email.trim(),
          token: out.token,
          role: 'client',
          loginId: out.loginId,
        });
        // A page load, as every change of login is: this tab was someone else.
        window.location.assign(await destinationAfterSignIn('/'));
        return;
      }
      if (out.kind === 'not-valid') {
        setCodeError(out.message);
        document.getElementById('client-code')?.focus();
      } else {
        setFormError(out.message);
      }
    } catch (err) {
      setFormError(signInErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <ClientCodeFormView
      step={step}
      email={email}
      code={code}
      emailError={emailError}
      codeError={codeError}
      formError={formError}
      resent={resent}
      pending={pending}
      onEmailChange={setEmail}
      onCodeChange={setCode}
      onRequest={request}
      onVerify={(e) => void verify(e)}
      onResend={() => void ask(true)}
      onDifferentEmail={() => {
        setStep('email');
        setCode('');
        setRequestId(undefined);
        setCodeError(undefined);
        setFormError(undefined);
        setResent(false);
      }}
    />
  );
}
