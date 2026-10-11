import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EMAIL_CODE_SENT, emailCodeVerifyOutcome } from '@/lib/email-code';
import { EmailCodeFormView, type EmailCodeFormViewProps } from './email-code-form';

/**
 * Sign in with an emailed code, rendered: the email step, then the code
 * step with the ONE notice (the same for a login and a stranger), the
 * 8-digit field made for a keypad and a paste, Send a new code, Use a
 * different email and Use your password. A code that does not work is the one
 * sentence on the code field, and the code step stays as it was.
 */
const noop = () => {};
const view = (over: Partial<EmailCodeFormViewProps> = {}) =>
  renderToStaticMarkup(
    createElement(EmailCodeFormView, {
      step: 'email',
      email: '',
      code: '',
      pending: false,
      onEmailChange: noop,
      onCodeChange: noop,
      onRequest: noop,
      onVerify: noop,
      onResend: noop,
      onDifferentEmail: noop,
      onUsePassword: noop,
      ...over,
    }),
  );

/** The status notice's text, tags stripped. */
const notice = (html: string) =>
  html.match(/<p role="status"[^>]*>(.*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, '');

describe('EmailCodeFormView', () => {
  it('the email step: the email and Email me a code, and no code field', () => {
    const html = view();
    expect(html).toContain('For client logins. We send a sign-in code to this email.');
    expect(html).toContain('Use your password');
    // Codes go to client logins only (W5c contract): never "any login".
    expect(html).not.toMatch(/any login|without a password/i);
    expect(html).toContain('id="email-code-email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('Email me a code');
    expect(html).not.toContain('id="email-code"');
    expect(notice(html)).toBeUndefined();
  });

  it('the code step: the one notice, whoever the email is', () => {
    const known = view({ step: 'code', email: 'pat@example.invalid' });
    const stranger = view({ step: 'code', email: 'nobody@example.invalid' });
    expect(notice(known)).toBe(EMAIL_CODE_SENT);
    expect(notice(stranger)).toBe(EMAIL_CODE_SENT);
    // Nothing else differs but the address typed.
    expect(known.replaceAll('pat@example.invalid', 'X')).toBe(
      stranger.replaceAll('nobody@example.invalid', 'X'),
    );
    // Send a new code says it asked again, and still promises nothing more.
    expect(notice(view({ step: 'code', resent: true }))).toBe(`Asked again. ${EMAIL_CODE_SENT}`);
  });

  it('the code field: a text field for a keypad and a paste, and the three actions', () => {
    const html = view({ step: 'code', email: 'pat@example.invalid' });
    const input = html.match(/<input[^>]*id="email-code"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('type="text"');
    expect(input).toContain('inputMode="numeric"');
    expect(input).toContain('autoComplete="one-time-code"');
    expect(input).not.toContain('maxLength');
    expect(html).toContain('Enter the 8-digit code');
    expect(html).toContain('Sign in</');
    expect(html).toContain('Send a new code');
    expect(html).toContain('Use a different email');
    expect(html).toContain('Use your password');
    // Codes go to client logins only (W5c contract): never "any login".
    expect(html).not.toMatch(/any login|without a password/i);
    // The email step is gone.
    expect(html).not.toContain('id="email-code-email"');
  });

  it('a code that does not work: the one sentence on the field, and the step as it was', () => {
    const outcome = emailCodeVerifyOutcome(401, {
      error: 'That code did not work. Ask for a new one.',
    });
    expect(outcome.kind).toBe('not-valid');
    const html = view({
      step: 'code',
      email: 'pat@example.invalid',
      code: '12345678',
      codeError: outcome.kind === 'not-valid' ? outcome.message : undefined,
    });
    expect(html).toMatch(
      /<[^>]*id="email-code-field-error"[^>]*>That code did not work\. Ask for a new one\.</,
    );
    const input = html.match(/<input[^>]*id="email-code"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('aria-describedby="email-code-field-error email-code-hint"');
    // No second message, and the same notice, field and actions as before.
    expect(html.match(/did not work/g)).toHaveLength(1);
    expect(notice(html)).toBe(EMAIL_CODE_SENT);
    expect(html).toContain('Send a new code');
  });

  it('an error on the email step stays on the email step', () => {
    const html = view({ formError: 'Too many attempts. Wait a minute, then try again.' });
    expect(html).toContain('Too many attempts. Wait a minute, then try again.');
    expect(html).toContain('id="email-code-email"');
    expect(html).not.toContain('id="email-code"');
  });
});
