import { describe, expect, it } from 'vitest';
import type { TeamRequest } from '@mantle/client-types';
import {
  canReplyToRequest,
  isClientRequest,
  requestChatHref,
  requestFromText,
} from './team-requests';

const LOGIN = '0b8f3c2e-1111-4111-8111-111111111111';
const CONTACT = '0b8f3c2e-2222-4222-8222-222222222222';

describe('a request a member login filed (no contact)', () => {
  const r = { contactId: null, loginId: LOGIN };

  it('can be replied to', () => {
    expect(canReplyToRequest(r)).toBe(true);
  });

  it("links to that login's Chat in Settings > Logins", () => {
    expect(requestChatHref(r)).toBe(`/settings/users?selected=${LOGIN}&view=chat`);
  });
});

describe('a request from the old team portal (a contact)', () => {
  const r = { contactId: CONTACT, loginId: null };

  it('can be replied to', () => {
    expect(canReplyToRequest(r)).toBe(true);
  });

  it('has no chat link: the Chat archive was removed', () => {
    expect(requestChatHref(r)).toBeNull();
  });

  it('works on a brain that sends no loginId at all', () => {
    // A brain before the audit fix release omits the field the contract now requires.
    const older = { contactId: CONTACT } as Pick<TeamRequest, 'contactId' | 'loginId'>;
    expect(canReplyToRequest(older)).toBe(true);
    expect(requestChatHref(older)).toBeNull();
  });
});

describe('a request with both', () => {
  it("prefers the login's chat, where the reply lands", () => {
    expect(requestChatHref({ contactId: CONTACT, loginId: LOGIN })).toBe(
      `/settings/users?selected=${LOGIN}&view=chat`,
    );
  });
});

describe('a request with neither', () => {
  it('offers no reply and no chat link', () => {
    expect(canReplyToRequest({ contactId: null, loginId: null })).toBe(false);
    expect(requestChatHref({ contactId: null, loginId: null })).toBeNull();
  });
});

/** A request a client filed (client logins C4): badged, and never "from a
 *  team member". */
describe('a request a client filed', () => {
  it('is a client request only when the brain says so', () => {
    expect(isClientRequest({ fromClient: true })).toBe(true);
    expect(isClientRequest({ fromClient: false })).toBe(false);
    // A brain before C4 sends no flag: a member's.
    expect(isClientRequest({})).toBe(false);
  });

  it('is from a client, or the contact named', () => {
    expect(requestFromText({ contactName: null, fromClient: true })).toBe('a client');
    expect(requestFromText({ contactName: null })).toBe('a team member');
    expect(requestFromText({ contactName: 'Pat', fromClient: true })).toBe('Pat');
  });
});
