/**
 * The words on the switch of an outside tool (Settings > Tools). Since brain
 * team apps Phase 2 one switch means two things:
 *
 *  - on a CONNECTOR tool (mcp) it is the READ-ONLY MARK: the workspaces
 *    that hold the connector decide who may use the tool (W5b2 contract 28,
 *    no connector level any more), and the mark decides whether a call
 *    reads (marked) or changes data (unmarked);
 *  - on an http tool it is "External access", as before: shared apps may
 *    call it at all only while it is on.
 *
 * Pure, pinned by tool-access-copy.test.ts.
 */
export type ToolAccessCopy = {
  label: string;
  hint: string;
  warn: string;
  stale: string;
  dialogTitle: (slug: string) => string;
  dialogBody: string[];
  action: string;
  toastOn: string;
  toastOff: string;
};

const MARK: ToolAccessCopy = {
  label: 'Read-only',
  hint: 'Marks this connector tool as one that only reads. Who may use it is set on each workspace screen (Connectors). Without the mark the tool counts as changing data: it runs only in a workspace with the connector’s Write tick on, for that workspace’s Moderators, and over MCP only with the Write switch on. Open links never use it.',
  warn: 'Every user of a workspace that holds the connector can call its tools by hand, with any input. If a tool takes free SQL, they can read anything the connector can read.',
  stale:
    'This tool changed after it was marked, so users and apps cannot use it now. Mark it again to confirm the new version.',
  dialogTitle: (slug) => `Mark “${slug}” as read-only?`,
  dialogBody: [
    'A read-only tool is offered to every user of a workspace that holds the connector, also on their MCP without the Write switch, and in the apps those workspaces hold.',
    'The brain cannot see what an outside tool does. Mark only a tool that reads data and never changes it. Every call is logged with who made it.',
  ],
  action: 'Mark read-only',
  toastOn: 'Marked read-only',
  toastOff: 'Read-only mark removed: the tool counts as changing data',
};

const EXTERNAL: ToolAccessCopy = {
  label: 'External access',
  hint: 'Lets shared apps that declare this tool call it, for everyone they are shared with: team members, clients, and contacts you send the app to. Open links never use it.',
  warn: "Everyone an app is shared with can call this tool by hand, with any input, not only what the app's screens send. If it takes free SQL, they can read anything the connector can read.",
  stale:
    "This tool changed after it was confirmed, so shared apps can't use it now. Switch it on again to confirm the new version.",
  dialogTitle: (slug) => `Give “${slug}” External access?`,
  dialogBody: [
    'Everyone an app that declares this tool is shared with can call it: team members, clients, and contacts you send the app to. They can also call it by hand, from their browser, with ANY input, not only what the app’s screens send. No model checks the calls.',
    'The brain can’t see what an outside tool does. Switch this on only for a tool that reads data and never changes it. Every call is logged with who made it.',
  ],
  action: 'Give External access',
  toastOn: 'External access is on',
  toastOff: 'External access is off',
};

/** The words for a tool by its handler kind. */
export function toolAccessCopy(kind: string): ToolAccessCopy {
  return kind === 'mcp' ? MARK : EXTERNAL;
}

/** The fields of a tool that the rules below read. */
export type ToolAccessFacts = {
  handler: { kind: string; method?: string };
  requiresConfirm?: boolean;
  externalAccess?: { on: boolean } | null;
};

/** Why the switch can't be turned on as the tool stands, else null. Mirrors
 *  the brain's rule; the brain refuses anyway. */
export function blockedReason(tool: ToolAccessFacts): string | null {
  const h = tool.handler;
  const mcp = h.kind === 'mcp';
  if (h.kind === 'http' && (h.method === 'PUT' || h.method === 'PATCH' || h.method === 'DELETE')) {
    return `This tool sends ${h.method}, which changes data, so it can't get External access.`;
  }
  if (tool.requiresConfirm) {
    return mcp
      ? 'This tool needs your confirmation on every call. Nobody is there to confirm for a member, client or app, so only you can use it, and it can’t be marked read-only.'
      : 'This tool needs your confirmation on every call. Nobody is there to confirm in an app, so it can’t get External access.';
  }
  return null;
}

/** The small tag on a tool in the list, or null for none. */
export type ToolAccessBadge = { label: string; tone: 'neutral' | 'warning'; title: string };

export function toolAccessBadge(tool: ToolAccessFacts): ToolAccessBadge | null {
  const state = tool.externalAccess ?? null;
  if (tool.handler.kind === 'mcp') {
    if (state?.on) {
      return { label: 'read-only', tone: 'neutral', title: 'Marked read-only: it only reads data' };
    }
    if (state) {
      return {
        label: 'changed',
        tone: 'warning',
        title:
          'Changed after it was marked: members, clients and apps can’t use it until you mark it again',
      };
    }
    return {
      label: 'writes',
      tone: 'warning',
      title: 'Not marked read-only: it counts as a tool that changes data',
    };
  }
  if (tool.handler.kind === 'http' && state?.on) {
    return { label: 'external', tone: 'warning', title: 'External access is on' };
  }
  return null;
}
