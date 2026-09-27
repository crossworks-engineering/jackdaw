import { describe, expect, it } from 'vitest';
import { memberAppHref, memberHubNav } from './member-apps';

const PAGE = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-222222222222';
const hub = {
  sections: [
    {
      token: PAGE,
      title: 'Plan',
      icon: null,
      summary: null,
      updatedAt: '2026-09-27T00:00:00Z',
      parentToken: null,
    },
  ],
  apps: [{ token: APP, title: 'Polls', description: null, updatedAt: '2026-09-27T00:00:00Z' }],
};

describe('memberHubNav', () => {
  it('opens the chat dock', () => {
    expect(memberHubNav(hub, 'chat')).toEqual({ kind: 'chat' });
  });

  it('opens a listed section in the Library and a listed app in the run view', () => {
    expect(memberHubNav(hub, { briefing: PAGE })).toEqual({
      kind: 'href',
      href: `/pages?id=${PAGE}&src=library`,
    });
    expect(memberHubNav(hub, { app: APP })).toEqual({ kind: 'href', href: memberAppHref(APP) });
  });

  it('goes nowhere for a token the payload did not list', () => {
    expect(memberHubNav(hub, { briefing: APP })).toBeNull();
    expect(memberHubNav(hub, { app: PAGE })).toBeNull();
    expect(memberHubNav(hub, { briefing: '/settings' })).toBeNull();
  });
});
