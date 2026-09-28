/**
 * Agent delete: keep or delete its conversation. The brain's
 * `DELETE /api/agents/:id?conversation=keep|delete` (mantle v0.232.312,
 * docs/conversation.md §6b) either leaves the agent's chat history in the
 * brain (replayable, but no screen can open it) or removes it together with
 * the agent's conversation digests.
 */

export type ConversationMode = 'keep' | 'delete';

/** What the brain answers. `conversation` and the counts are absent on a
 *  brain older than v0.232.312, which ignores the query and always keeps. */
export type AgentDeleteResponse = {
  ok: boolean;
  conversation?: ConversationMode;
  deletedMessages?: number;
  deletedDigests?: number;
};

export function agentDeletePath(id: string, mode: ConversationMode): string {
  return `/api/agents/${encodeURIComponent(id)}?conversation=${mode}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The toast after a delete. `warn` is set when the brain did not do what
 *  was asked: an older brain kept the conversation the owner chose to delete. */
export function agentDeleteOutcome(
  name: string,
  asked: ConversationMode,
  res: AgentDeleteResponse,
): { message: string; warn: boolean } {
  if (asked === 'delete' && res.conversation !== 'delete') {
    return {
      message: `Deleted ${name}. This brain kept its conversation; update the brain to delete it.`,
      warn: true,
    };
  }
  if (asked === 'delete') {
    return {
      message: `Deleted ${name} and ${plural(res.deletedMessages ?? 0, 'message')}.`,
      warn: false,
    };
  }
  return { message: `Deleted ${name}. Its conversation is kept.`, warn: false };
}
