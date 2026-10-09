import { describe, expect, it } from 'vitest';
import {
  clientActionsBlocked,
  clientCreateErrorText,
  clientLinkErrorText,
  clientName,
  clientSigninUrl,
  loginDeleteText,
  openLinkAt,
} from './client-logins';

/**
 * Team admin > Clients (client logins C2), the pure half: when Add client
 * and Issue sign-in link may run, the full link an admin hands over, and
 * what each refusal says.
 */
describe('clientActionsBlocked', () => {
  it('blocks until "What clients see" is acknowledged, and while unknown', () => {
    expect(clientActionsBlocked(undefined)).toBe(true);
    expect(clientActionsBlocked({ reportAcknowledged: false })).toBe(true);
    expect(clientActionsBlocked({ reportAcknowledged: true })).toBe(false);
  });
});

describe('clientSigninUrl', () => {
  it('is this app’s origin plus the brain’s path', () => {
    expect(clientSigninUrl('https://app.example.invalid/', '/client-signin?code=abc')).toBe(
      'https://app.example.invalid/client-signin?code=abc',
    );
    expect(clientSigninUrl('https://app.example.invalid', 'client-signin?code=abc')).toBe(
      'https://app.example.invalid/client-signin?code=abc',
    );
    // Brains with the audit fixes: the code in the fragment (B12).
    expect(clientSigninUrl('https://app.example.invalid', '/client-signin#code=abc')).toBe(
      'https://app.example.invalid/client-signin#code=abc',
    );
  });
});

describe('refusals', () => {
  it('Add client: each reason in the admin’s words', () => {
    expect(clientCreateErrorText(409, { reason: 'report-not-acknowledged' })).toMatch(
      /^Check the list in What clients see first\./,
    );
    expect(clientCreateErrorText(409, { reason: 'email-has-login' })).toMatch(/already signs in/);
    expect(clientCreateErrorText(409, { reason: 'contact-has-login' })).toMatch(
      /already has a login/,
    );
    expect(clientCreateErrorText(400, { reason: 'no-email' })).toMatch(/no email address/);
    // A typed email the picked contact does not have (audit fix).
    expect(clientCreateErrorText(400, { reason: 'email-not-on-contact' })).toBe(
      'That email is not on this contact. Leave it blank to use the contact’s email, or add it to the contact first.',
    );
    expect(clientCreateErrorText(400, { reason: 'contact-not-found' })).toMatch(
      /not in this brain/,
    );
    expect(clientCreateErrorText(400, {})).toBe(
      'Enter a valid email address, or choose a contact.',
    );
    expect(clientCreateErrorText(500, undefined)).toBe('Could not add the client. Try again.');
  });

  it('Issue sign-in link: the report, a login that is not a client, the rest', () => {
    expect(clientLinkErrorText(409, { reason: 'report-not-acknowledged' })).toMatch(
      /What clients see/,
    );
    expect(clientLinkErrorText(404, { reason: 'not-a-client' })).toBe(
      'This login is not an active client login any more.',
    );
    expect(clientLinkErrorText(500, { error: 'db down' })).toBe(
      'Could not issue a sign-in link. Try again.',
    );
  });
});

describe('rows', () => {
  const row = {
    displayName: null,
    email: 'pat@example.invalid',
    openLink: {
      id: 'l1',
      createdAt: '2026-09-28T10:00:00.000Z',
      expiresAt: '2026-10-01T10:00:00.000Z',
    },
  };

  it('names a login by its display name, else its email', () => {
    expect(clientName(row)).toBe('pat@example.invalid');
    expect(clientName({ ...row, displayName: '  Pat  ' })).toBe('Pat');
  });

  it('an open link counts only until it expires', () => {
    expect(openLinkAt(row, Date.parse('2026-09-30T10:00:00.000Z'))).toBe(row.openLink);
    expect(openLinkAt(row, Date.parse('2026-10-02T10:00:00.000Z'))).toBeNull();
    expect(openLinkAt({ openLink: null }, 0)).toBeNull();
  });
});

describe('deleting a login (client tier audit I5)', () => {
  const row = { displayName: 'Pat', email: 'pat@example.invalid' };

  it('a client: its chat thread goes with it, and Disable keeps it', () => {
    const text = loginDeleteText({ ...row, role: 'client' });
    expect(text).toContain('chat thread this client wrote is deleted');
    // No comments to speak of any more (removed 2026-10-09).
    expect(text).not.toMatch(/comment/i);
    expect(text).toContain('disable the login instead');
    expect(text).not.toContain('Nothing in the brain is removed');
  });

  it('an admin or a member: everything they made stays', () => {
    for (const role of ['admin', 'member']) {
      expect(loginDeleteText({ ...row, role })).toContain('everything they created stays');
    }
  });
});
