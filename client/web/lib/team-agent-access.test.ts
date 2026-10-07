import { describe, expect, it } from 'vitest';
import {
  CLOSE_TEAM_CHAT_BODY,
  OPEN_TEAM_CHAT_BODY,
  openedMessage,
  teamAgentPath,
  teamAgentState,
  type TeamAgentAccess,
} from './team-agent-access';
import { TeamAgentNotice } from '../components/team-admin/team-agent-access';

/**
 * Team > Settings, Member chat: the team agent ships at Admin level and a
 * member login chats only with a Team-level agent, so this card is the one
 * step that opens member chat (it replaced the MCP/API steps in the docs).
 */
const agent = (audience: TeamAgentAccess['audience']): TeamAgentAccess => ({
  slug: 'team-responder',
  name: 'Team Responder',
  audience,
  enabled: true,
});

describe('teamAgentState', () => {
  it('on only at Team level', () => {
    expect(teamAgentState(agent('team'))).toBe('on');
    expect(teamAgentState(agent('admin'))).toBe('off');
    expect(teamAgentState(agent('client'))).toBe('off');
  });
  it('missing when the brain has none, unknown when the brain does not say', () => {
    expect(teamAgentState(null)).toBe('missing');
    expect(teamAgentState(undefined)).toBe('unknown');
  });
});

describe('the level change', () => {
  it('opens with Team and drops the groups above it in the same step', () => {
    expect(OPEN_TEAM_CHAT_BODY).toEqual({ audience: 'team', dropGroupsAbove: true });
  });
  it('closes back to Admin and never drops a group', () => {
    expect(CLOSE_TEAM_CHAT_BODY).toEqual({ audience: 'admin' });
  });
  it('goes to the existing access route for the agent', () => {
    expect(teamAgentPath('team-responder')).toBe('/api/access/agents/team-responder');
    expect(teamAgentPath('a b')).toBe('/api/access/agents/a%20b');
  });
});

describe('openedMessage', () => {
  it('names the removed tool groups, if any', () => {
    expect(openedMessage('Team Responder', [])).toBe('Members can now chat with Team Responder.');
    expect(openedMessage('Team Responder', ['team-read-admin'])).toBe(
      'Members can now chat with Team Responder. Removed tool group above Team: team-read-admin.',
    );
    expect(openedMessage('T', ['a', 'b'])).toBe(
      'Members can now chat with T. Removed tool groups above Team: a, b.',
    );
  });
});

describe('TeamAgentNotice (Invites tab)', () => {
  it('shows only when members cannot chat', () => {
    expect(TeamAgentNotice({ agent: agent('team') })).toBeNull();
    expect(TeamAgentNotice({ agent: undefined })).toBeNull();
    expect(TeamAgentNotice({ agent: agent('admin') })).not.toBeNull();
    expect(TeamAgentNotice({ agent: null })).not.toBeNull();
  });
});
