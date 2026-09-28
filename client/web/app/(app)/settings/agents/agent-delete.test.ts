import { describe, expect, it } from 'vitest';
import { agentDeleteOutcome, agentDeletePath } from './agent-delete';

describe('agentDeletePath', () => {
  it('always names the mode, so the brain never has to guess', () => {
    expect(agentDeletePath('a1', 'keep')).toBe('/api/agents/a1?conversation=keep');
    expect(agentDeletePath('a1', 'delete')).toBe('/api/agents/a1?conversation=delete');
  });
});

describe('agentDeleteOutcome', () => {
  it('reports the message count when the conversation was deleted', () => {
    expect(
      agentDeleteOutcome('Paul', 'delete', {
        ok: true,
        conversation: 'delete',
        deletedMessages: 152,
        deletedDigests: 3,
      }),
    ).toEqual({ message: 'Deleted Paul and 152 messages.', warn: false });
    expect(
      agentDeleteOutcome('Paul', 'delete', {
        ok: true,
        conversation: 'delete',
        deletedMessages: 1,
        deletedDigests: 0,
      }).message,
    ).toBe('Deleted Paul and 1 message.');
  });

  it('says the conversation is kept on keep', () => {
    expect(
      agentDeleteOutcome('Paul', 'keep', {
        ok: true,
        conversation: 'keep',
        deletedMessages: 0,
        deletedDigests: 0,
      }),
    ).toEqual({ message: 'Deleted Paul. Its conversation is kept.', warn: false });
  });

  it('warns when an older brain ignored the delete request', () => {
    // A brain before v0.232.312 answers { ok: true } and keeps the messages.
    const out = agentDeleteOutcome('Paul', 'delete', { ok: true });
    expect(out.warn).toBe(true);
    expect(out.message).toMatch(/kept its conversation/);
  });
});
