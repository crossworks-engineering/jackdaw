import { describe, expect, it } from 'vitest';
import {
  NO_SENDER,
  capReachedText,
  senderBody,
  senderErrorText,
  senderStateText,
  sentCountText,
} from './client-signin-sender';

/**
 * Sign-in codes by email (client logins C2b), the admin's pure half: what
 * the picker sends, what it says under it, and each refusal.
 */
const SENDER = { id: '11111111-1111-4111-8111-111111111111', address: 'desk@example.invalid' };

describe('senderBody', () => {
  it('None is null; an account is its id', () => {
    expect(senderBody(NO_SENDER)).toEqual({ accountId: null });
    expect(senderBody(SENDER.id)).toEqual({ accountId: SENDER.id });
  });
});

describe('the words', () => {
  it('codes off, the folders kept out, or the marker alone', () => {
    expect(senderStateText({ sender: null, sentFoldersExcluded: [] })).toMatch(/^Codes are off\./);
    expect(senderStateText({ sender: SENDER, sentFoldersExcluded: ['Sent', 'Sent Items'] })).toBe(
      'Sent mail from this account is kept out of the brain: Sent, Sent Items.',
    );
    expect(senderStateText({ sender: SENDER, sentFoldersExcluded: [] })).toMatch(/marker/);
  });

  it('the cap and the count', () => {
    expect(capReachedText(200)).toBe(
      'The daily limit of 200 sign-in codes is reached. Requests are still accepted, but no code is sent until the window moves on.',
    );
    expect(sentCountText({ sentLast24h: 3, dailyCap: 200 })).toBe(
      '3 of 200 codes sent in the last 24 hours.',
    );
  });
});

describe('senderErrorText', () => {
  it('each reason in the admin’s words, then the brain’s, then ours', () => {
    expect(senderErrorText(404, { reason: 'account-not-found' })).toMatch(/not in this brain/);
    expect(senderErrorText(400, { reason: 'account-cannot-send' })).toMatch(/IMAP and SMTP/);
    expect(senderErrorText(400, { error: 'Choose an email account, or none.' })).toBe(
      'Choose an email account, or none.',
    );
    expect(senderErrorText(500, { error: 'db down' })).toBe(
      'Could not save the sign-in sender. Try again.',
    );
    expect(senderErrorText(0, undefined)).toBe('Could not save the sign-in sender. Try again.');
  });
});
