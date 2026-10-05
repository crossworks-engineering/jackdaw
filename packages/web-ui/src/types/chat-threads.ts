/**
 * TEMPORARY contract shim: the chat archive wire shapes ("New chat" and
 * "Previous chats", mantle migration 0231, docs/conversation.md §6c).
 *
 * The brain's contract lives in @mantle/client-types (`src/dto/views.ts`:
 * `ChatThreadRow`, `ChatArchiveResponse`), and the pinned 0.237.1 does not
 * carry them yet. This file is a verbatim copy of mantle's shapes.
 *
 * At the pin bump that carries them, this whole file becomes:
 *   export type { ChatThreadRow, ChatArchiveResponse } from '@mantle/client-types';
 * and nothing that imports from here has to change. Do not edit the shapes
 * below by hand: change them in mantle and re-copy.
 */

/**
 * One thread of an agent's chat (chat archive, migration 0231,
 * docs/conversation.md §6c). A thread is a time range over the agent's
 * messages: the open thread is the live chat, an archived one is read-only
 * and can seed a new chat ("Continue from this").
 */
export type ChatThreadRow = {
  id: string;
  agentId: string;
  status: 'open' | 'archived';
  /** Model-written title (or the first user line when the summary failed);
   *  null on an open thread. */
  title: string | null;
  startedAt: string;
  /** Null on the open thread. */
  archivedAt: string | null;
  /** Complete turns in the thread when it was archived (0 while open). */
  turnCount: number;
  /** The archive summary, null until written (or when the model call failed). */
  summary: string | null;
  summaryNodeId: string | null;
  /** The archived thread this one was started from with "Continue from this". */
  continuedFrom: { id: string; title: string | null } | null;
};

/** POST /api/assistant/threads (New chat) and .../continue. */
export type ChatArchiveResponse = {
  /** The thread just archived; null when the chat was empty. */
  archived: ChatThreadRow | null;
  /** The open thread now. */
  open: ChatThreadRow | null;
};
