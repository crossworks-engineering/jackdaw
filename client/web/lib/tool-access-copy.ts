/**
 * The words on the switch of an outside tool (Settings > Tools). Since brain
 * team apps Phase 2 one switch means two things:
 *
 *  - on a CONNECTOR tool (mcp) it is the READ-ONLY MARK: the connector's
 *    level decides who may use the tool, and the mark decides whether a call
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
  hint: "Marks this connector tool as one that only reads. Who may use it is the connector's level (Settings > Tool groups). Without the mark the tool counts as changing data: apps at the connector's level may call it, and a member's or client's MCP only with their Write switch on.",
  warn: 'Everyone at the connector’s level can call its tools by hand, with any input. If a tool takes free SQL, they can read anything the connector can read.',
  stale:
    'This tool changed after it was marked, so it counts as changing data now. Mark it again to confirm the new version.',
  dialogTitle: (slug) => `Mark “${slug}” as read-only?`,
  dialogBody: [
    'A read-only tool is offered to every member or client at the connector’s level, also on their MCP without the Write switch, and in every app at that level.',
    'The brain can’t see what an outside tool does. Mark only a tool that reads data and never changes it. Every call is logged with who made it.',
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
