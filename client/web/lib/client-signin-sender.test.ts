import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  EMAIL_WORKER_OFF_TEXT,
  isMissingPreviewRoute,
  NO_SENDER,
  capReachedText,
  codesWorkerOff,
  lastFailureText,
  senderBody,
  senderChangeConfirm,
  senderChangedText,
  senderErrorText,
  senderPreviewOutcome,
  senderPreviewPath,
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

describe('what the brain did with codes (audit B3)', () => {
  it('delivered against the cap, failed sends and limit skips, when the brain says', () => {
    expect(
      sentCountText({
        sentLast24h: 7,
        dailyCap: 200,
        deliveredLast24h: 5,
        failedLast24h: 2,
        capSkipsLast24h: 1,
      }),
    ).toBe(
      '5 of 200 codes delivered in the last 24 hours, 2 sends failed, 1 request skipped at a limit.',
    );
    expect(
      sentCountText({
        sentLast24h: 1,
        dailyCap: 200,
        deliveredLast24h: 1,
        failedLast24h: 1,
        capSkipsLast24h: 0,
      }),
    ).toBe(
      '1 of 200 codes delivered in the last 24 hours, 1 send failed, 0 requests skipped at a limit.',
    );
    // An older brain: its own count, as before.
    expect(sentCountText({ sentLast24h: 3, dailyCap: 200 })).toBe(
      '3 of 200 codes sent in the last 24 hours.',
    );
  });

  it('the last failure: when and why', () => {
    const when = (iso: string) => `AT(${iso})`;
    expect(
      lastFailureText(
        { lastFailure: { at: '2026-09-29T08:00:00.000Z', reason: '535 Authentication failed' } },
        when,
      ),
    ).toBe('Last failed send AT(2026-09-29T08:00:00.000Z): 535 Authentication failed');
    expect(lastFailureText({ lastFailure: { at: 'x', reason: ' ' } }, when)).toBe(
      'Last failed send AT(x): no reason given',
    );
    expect(lastFailureText({ lastFailure: null }, when)).toBeNull();
    expect(lastFailureText({}, when)).toBeNull();
  });

  it('no email worker on this box: codes are off, whatever the sender', () => {
    expect(codesWorkerOff({ emailWorker: false })).toBe(true);
    expect(codesWorkerOff({ emailWorker: true })).toBe(false);
    // A brain that does not say is taken at its word that it can.
    expect(codesWorkerOff({})).toBe(false);
    expect(EMAIL_WORKER_OFF_TEXT).toMatch(
      /^The email worker is not running on this box: codes are off\./,
    );
    expect(
      senderStateText({ sender: SENDER, sentFoldersExcluded: ['Sent'], emailWorker: false }),
    ).toBe('Codes are off on this box (no email worker), though desk@example.invalid is picked.');
  });
});

describe('a sender change is confirmed first (audit B4)', () => {
  it('asks the preview for the account', () => {
    expect(senderPreviewPath(SENDER.id)).toBe(
      `/api/team-admin/clients/signin-sender/preview?accountId=${SENDER.id}`,
    );
  });

  it('the preview: confirm with its folders, or the refusal in words', () => {
    expect(senderPreviewOutcome({ sentFolders: ['Sent'], canUse: true })).toEqual({
      kind: 'confirm',
      folders: ['Sent'],
    });
    for (const [reason, words] of [
      ['no-sent-folder', /no sent-mail folder/],
      ['folders-unreadable', /could not be read/],
      ['account-cannot-send', /IMAP and SMTP/],
    ] as const) {
      const out = senderPreviewOutcome({ sentFolders: [], canUse: false, reason });
      expect(out.kind, reason).toBe('refused');
      expect(out.kind === 'refused' && out.message, reason).toMatch(words);
    }
  });

  it('picking names the folders that leave mail sync, and those that come back', () => {
    const c = senderChangeConfirm({
      kind: 'pick',
      accountId: SENDER.id,
      address: SENDER.address,
      folders: ['Sent', 'Sent Items'],
      restored: ['Gesendet'],
    });
    expect(c.title).toBe('Send sign-in codes from desk@example.invalid?');
    expect(c.body).toContain('These folders are left out of mail sync');
    expect(c.body).toContain(': Sent, Sent Items.');
    expect(c.body).toContain('These come back into mail sync: Gesendet.');
    expect(c.body).toContain('Choosing None later brings them back.');
    // A brain before the preview route: no names, still said.
    expect(
      senderChangeConfirm({
        kind: 'pick',
        accountId: SENDER.id,
        address: SENDER.address,
        folders: null,
        restored: [],
      }).body,
    ).toMatch(/^Its sent-mail folders are left out of mail sync/);
  });

  it('None says the folders come back', () => {
    const c = senderChangeConfirm({ kind: 'none', restored: ['Sent', 'Sent Items'] });
    expect(c.title).toBe('Turn sign-in codes off?');
    expect(c.body).toBe(
      'Clients then sign in only with a link you issue. These folders come back into mail sync: Sent, Sent Items.',
    );
    expect(senderChangedText({ sender: null }, ['Sent', 'Sent Items'])).toBe(
      'Sign-in codes are off. Sent, Sent Items came back into mail sync.',
    );
    expect(senderChangedText({ sender: SENDER }, [])).toBe(
      'Sign-in codes are sent from desk@example.invalid.',
    );
  });

  it('a brain without the preview route is told apart from a refused account', () => {
    expect(isMissingPreviewRoute(new ApiError('Not found', 404))).toBe(true);
    expect(isMissingPreviewRoute(new ApiError('Not found', 404, { error: 'Not found.' }))).toBe(
      true,
    );
    expect(
      isMissingPreviewRoute(
        new ApiError('gone', 404, {
          error: 'Email account not found.',
          reason: 'account-not-found',
        }),
      ),
    ).toBe(false);
    expect(
      isMissingPreviewRoute(new ApiError('bad', 400, { error: 'Choose an email account.' })),
    ).toBe(false);
    expect(isMissingPreviewRoute(new TypeError('fetch failed'))).toBe(false);
    // The route's own refusals read in words.
    expect(senderErrorText(404, { reason: 'account-not-found' })).toMatch(/not in this brain/);
    expect(senderErrorText(400, { error: 'Choose an email account.' })).toBe(
      'Choose an email account.',
    );
  });

  it('the new refusals (409) in words', () => {
    expect(senderErrorText(409, { reason: 'no-sent-folder' })).toMatch(/no sent-mail folder/);
    expect(senderErrorText(409, { reason: 'folders-unreadable' })).toMatch(/could not be read/);
  });
});
