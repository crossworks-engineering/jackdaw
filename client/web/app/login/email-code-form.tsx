'use client';

import { useState } from 'react';
import { apiUrl } from '@mantle/web-ui/api-fetch';
import { isCrossOrigin } from '@mantle/web-ui/runtime-env';
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
import {
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_PATH,
  EMAIL_CODE_SENT,
  EMAIL_CODE_VERIFY_PATH,
  emailCodeError,
  emailCodeRequestOutcome,
  emailCodeVerifyOutcome,
  EMAIL_CODE_UNAVAILABLE,
  emailAddressError,
  normalizeEmailCode,
} from '@/lib/email-code';
import { signInErrorMessage } from '@/lib/sign-in-error';

/**
 * Sign in with an emailed code: the sign-in page's way in for a login
 * without a password. Two steps: the email, then the 8-digit code. The first
 * step has ONE way forward: the brain answers every email the same (it never
 * says whether one has a login), so the page does too, and moves on to the
 * code step whatever was typed. "Use your password" goes back to the
 * password form from either step.
 *
 * Both requests carry this browser's cookies (same origin): the first answer
 * sets the request cookie the code is bound to, and the second must send it
 * back, so a code forwarded to another browser opens nothing. Signed in, the
 * brain has set the session cookie; `onSignedIn` goes where a password
 * sign-in goes.
 */
export function EmailCodeForm({
  onSignedIn,
  onUsePassword,
  initialEmail = '',
}: {
  onSignedIn: () => void | Promise<void>;
  onUsePassword: () => void;
  initialEmail?: string;
}) {
  const [step, setStep] = useState<EmailCodeStep>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  const post = (path: string, body: unknown) =>
    // Never from another origin (the page shows no form there): the code's
    // cookies live on the brain's origin, so it would be spent for nothing.
    isCrossOrigin()
      ? Promise.reject(new Error(EMAIL_CODE_UNAVAILABLE))
      : // RAW fetch, never apiFetch: a code that signs nobody in is a 401
        // here, which apiFetch would turn into a trip to /login.
        fetch(apiUrl(path), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include',
        });

  /** Ask for a code for `email`. Every 2xx is the same answer. */
  async function ask(again: boolean) {
    setPending(true);
    setFormError(undefined);
    setCodeError(undefined);
    try {
      const res = await post(EMAIL_CODE_PATH, { email: email.trim() });
      const outcome = emailCodeRequestOutcome(res.status);
      if (outcome.kind !== 'sent') {
        setFormError(outcome.message);
        return;
      }
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
    const err = emailAddressError(email);
    setEmailError(err ?? undefined);
    setFormError(undefined);
    if (err) {
      document.getElementById('email-code-email')?.focus();
      return;
    }
    void ask(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const err = emailCodeError(code);
    setCodeError(err ?? undefined);
    setFormError(undefined);
    if (err) {
      document.getElementById('email-code')?.focus();
      return;
    }
    setPending(true);
    try {
      const res = await post(EMAIL_CODE_VERIFY_PATH, {
        email: email.trim(),
        code: normalizeEmailCode(code),
      });
      const outcome = emailCodeVerifyOutcome(res.status, await res.json().catch(() => null));
      if (outcome.kind === 'ok') {
        await onSignedIn();
        return;
      }
      if (outcome.kind === 'not-valid') {
        setCodeError(outcome.message);
        document.getElementById('email-code')?.focus();
      } else {
        setFormError(outcome.message);
      }
    } catch (err) {
      setFormError(signInErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const differentEmail = () => {
    setStep('email');
    setCode('');
    setCodeError(undefined);
    setFormError(undefined);
    setResent(false);
  };

  return (
    <EmailCodeFormView
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
      onDifferentEmail={differentEmail}
      onUsePassword={onUsePassword}
    />
  );
}

export type EmailCodeStep = 'email' | 'code';

export type EmailCodeFormViewProps = {
  step: EmailCodeStep;
  email: string;
  code: string;
  emailError?: string;
  codeError?: string;
  formError?: string;
  /** "Send a new code" was used: said beside the one notice. */
  resent?: boolean;
  pending: boolean;
  onEmailChange: (email: string) => void;
  onCodeChange: (code: string) => void;
  onRequest: (e: React.FormEvent) => void;
  onVerify: (e: React.FormEvent) => void;
  onResend: () => void;
  onDifferentEmail: () => void;
  onUsePassword: () => void;
};

/** The two steps as markup: no state and no requests (the tests render it). */
export function EmailCodeFormView({
  step,
  email,
  code,
  emailError,
  codeError,
  formError,
  resent = false,
  pending,
  onEmailChange,
  onCodeChange,
  onRequest,
  onVerify,
  onResend,
  onDifferentEmail,
  onUsePassword,
}: EmailCodeFormViewProps) {
  const usePassword = (
    <Button type="button" variant="link" size="sm" disabled={pending} onClick={onUsePassword}>
      Use your password
    </Button>
  );
  if (step === 'email') {
    return (
      <form onSubmit={onRequest} noValidate>
        <FieldGroup>
          <Field data-invalid={!!emailError || undefined}>
            <FieldLabel htmlFor="email-code-email">Email</FieldLabel>
            <Input
              id="email-code-email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              autoComplete="email"
              autoFocus
              aria-invalid={!!emailError || undefined}
              aria-describedby={
                emailError
                  ? 'email-code-email-error email-code-email-hint'
                  : 'email-code-email-hint'
              }
            />
            <FieldDescription id="email-code-email-hint">
              The email you sign in with. We send a sign-in code to it.
            </FieldDescription>
            <FieldError id="email-code-email-error">{emailError}</FieldError>
          </Field>
          <FieldError id="email-code-error">{formError}</FieldError>
          <SubmitButton pending={pending} className="w-full">
            Email me a code
          </SubmitButton>
          <div className="flex justify-center">{usePassword}</div>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form onSubmit={onVerify} noValidate>
      <FieldGroup>
        <p
          role="status"
          className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
          data-testid="email-code-sent"
        >
          {resent ? 'Asked again. ' : ''}
          {EMAIL_CODE_SENT}
        </p>
        <Field data-invalid={!!codeError || undefined}>
          <FieldLabel htmlFor="email-code">Enter the {EMAIL_CODE_LENGTH}-digit code</FieldLabel>
          <Input
            id="email-code"
            // Text, not number: a number field drops leading zeros and
            // refuses a pasted "1234 5678". The keypad comes from inputMode.
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            spellCheck={false}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            autoFocus
            className="font-mono tracking-widest"
            aria-invalid={!!codeError || undefined}
            aria-describedby={
              codeError ? 'email-code-field-error email-code-hint' : 'email-code-hint'
            }
          />
          <FieldDescription id="email-code-hint">
            Sent to {email.trim() || 'your email'}.
          </FieldDescription>
          <FieldError id="email-code-field-error">{codeError}</FieldError>
        </Field>
        <FieldError id="email-code-error">{formError}</FieldError>
        <SubmitButton pending={pending} className="w-full">
          Sign in
        </SubmitButton>
        <div className="flex flex-wrap items-center justify-center gap-x-2">
          <Button type="button" variant="link" size="sm" disabled={pending} onClick={onResend}>
            Send a new code
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={pending}
            onClick={onDifferentEmail}
          >
            Use a different email
          </Button>
          {usePassword}
        </div>
      </FieldGroup>
    </form>
  );
}
