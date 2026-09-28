import { describe, expect, it } from 'vitest';
import { canReplyToRequest, requestChatHref } from './team-requests';

const LOGIN = '0b8f3c2e-1111-4111-8111-111111111111';
const CONTACT = '0b8f3c2e-2222-4222-8222-222222222222';

describe('a request a member login filed (no contact)', () => {
  const r = { contactId: null, loginId: LOGIN };

  it('can be replied to', () => {
    expect(canReplyToRequest(r)).toBe(true);
  });

  it('links to that login on Member chats', () => {
    expect(requestChatHref(r)).toBe(`/team-admin?view=chats&login=${LOGIN}`);
  });
});

describe('a request from the old team portal (a contact)', () => {
  const r = { contactId: CONTACT, loginId: null };

  it('can be replied to', () => {
    expect(canReplyToRequest(r)).toBe(true);
  });

  it('links to the contact on the Chat archive', () => {
    expect(requestChatHref(r)).toBe(`/team-admin?contact=${CONTACT}`);
  });

  it('works on a brain that sends no loginId at all', () => {
    expect(canReplyToRequest({ contactId: CONTACT })).toBe(true);
    expect(requestChatHref({ contactId: CONTACT })).toBe(`/team-admin?contact=${CONTACT}`);
  });
});

describe('a request with both', () => {
  it("prefers the login's chat, where the reply lands", () => {
    expect(requestChatHref({ contactId: CONTACT, loginId: LOGIN })).toBe(
      `/team-admin?view=chats&login=${LOGIN}`,
    );
  });
});

describe('a request with neither', () => {
  it('offers no reply and no chat link', () => {
    expect(canReplyToRequest({ contactId: null, loginId: null })).toBe(false);
    expect(requestChatHref({ contactId: null, loginId: null })).toBeNull();
  });
});
