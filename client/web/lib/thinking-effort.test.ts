import { describe, expect, it } from 'vitest';
import {
  AGENT_THINKING_EFFORT_OPTIONS,
  THINKING_EFFORT_WARNINGS,
  parseAgentThinkingEffort,
  profileThinkingLabel,
} from './thinking-effort';

describe('agent thinking effort options', () => {
  it("is Off plus every tier the brain takes, in order, with the profile's labels", () => {
    expect(AGENT_THINKING_EFFORT_OPTIONS).toEqual([
      { value: 'off', label: 'Off' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'xhigh', label: 'Extra high' },
      { value: 'max', label: 'Max' },
    ]);
  });

  it('parses only known values; anything else is inherit', () => {
    expect(parseAgentThinkingEffort('high')).toBe('high');
    expect(parseAgentThinkingEffort('off')).toBe('off');
    expect(parseAgentThinkingEffort('__inherit__')).toBeNull();
    expect(parseAgentThinkingEffort(undefined)).toBeNull();
  });

  it('warns on the expensive tiers only', () => {
    expect(Object.keys(THINKING_EFFORT_WARNINGS).sort()).toEqual(['high', 'max', 'xhigh']);
  });
});

describe('profileThinkingLabel (what Inherit means right now)', () => {
  it('names the profile tier', () => {
    expect(profileThinkingLabel({ streamThoughts: true, thinkingBudget: 4096 })).toBe('Medium');
    expect(profileThinkingLabel({ thinkingBudget: 1024 })).toBe('Low');
  });

  it('is Off when the budget is 0 or the live-thinking switch is off', () => {
    expect(profileThinkingLabel({ streamThoughts: true, thinkingBudget: 0 })).toBe('Off');
    expect(profileThinkingLabel({})).toBe('Off');
    expect(profileThinkingLabel({ streamThoughts: false, thinkingBudget: 8000 })).toBe('Off');
  });
});
