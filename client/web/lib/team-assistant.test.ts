import { describe, expect, it } from 'vitest';
import { NO_TEAM_ASSISTANT_TEXT, teamAssistantHref } from './team-assistant';

/** The Team workspace's Member chat section (W5c): the assistant's name, no
 *  level to set. */
describe('the team assistant', () => {
  it('opens on the assistants screen', () => {
    expect(teamAssistantHref('team-responder')).toBe('/settings/agents?selected=team-responder');
    expect(teamAssistantHref('a b')).toBe('/settings/agents?selected=a%20b');
  });

  it('says plainly when there is none, with no level words', () => {
    expect(NO_TEAM_ASSISTANT_TEXT).toBe(
      'No assistant. Members cannot chat until this workspace has one.',
    );
    expect(NO_TEAM_ASSISTANT_TEXT).not.toMatch(/level/i);
  });
});
