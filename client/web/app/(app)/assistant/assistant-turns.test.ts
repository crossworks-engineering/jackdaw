import { describe, expect, it } from 'vitest';

import {
  CONTEXT_KIND_LABEL,
  NON_NODE_KINDS,
  buildContextPreamble,
  groupTurns,
  splitSentContext,
  type Message,
} from './assistant-turns';
import { type ContextRef } from '@/components/assistant/assistant-dock';

/**
 * These three functions decide what the model actually RECEIVES and what the
 * reader actually SEES, and until now none of them had a test. `groupTurns`
 * owns the pairing the whole document layout rests on; `buildContextPreamble`
 * writes text straight into the sent message; `splitSentContext` is the only
 * thing standing between the reader and that machine-written tail.
 */

const msg = (id: string, direction: Message['direction'], text = id): Message => ({
  id,
  direction,
  text,
  createdAt: '2026-09-10T08:00:00.000Z',
});

describe('groupTurns', () => {
  it('pairs each prompt with the reply that follows it', () => {
    const turns = groupTurns([msg('a', 'inbound'), msg('b', 'outbound')]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.prompt?.id).toBe('a');
    expect(turns[0]!.response?.id).toBe('b');
    // The turn is keyed by the PROMPT, so the pair keeps a stable React key
    // when the reply lands and again when it is reconciled against the row.
    expect(turns[0]!.id).toBe('a');
  });

  it('gives a leading outbound its own promptless turn', () => {
    // Happens on a page-2 fetch that slices mid-turn, and for anything the
    // agent says unprompted. It must render, not vanish.
    const turns = groupTurns([msg('greeting', 'outbound'), msg('a', 'inbound')]);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.prompt).toBeUndefined();
    expect(turns[0]!.response?.id).toBe('greeting');
    expect(turns[0]!.id).toBe('greeting');
  });

  it('does not attach a SECOND reply to a turn that already has one', () => {
    // The case that would silently drop a message: two outbounds in a row.
    // The second opens its own turn rather than overwriting the first.
    const turns = groupTurns([msg('a', 'inbound'), msg('b', 'outbound'), msg('c', 'outbound')]);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.response?.id).toBe('b');
    expect(turns[1]!.response?.id).toBe('c');
    expect(turns[1]!.prompt).toBeUndefined();
  });

  it('leaves a prompt awaiting its reply', () => {
    // The live state for the whole duration of a turn — the stream renders
    // against a turn whose response is still undefined.
    const turns = groupTurns([msg('a', 'inbound')]);
    expect(turns[0]!.prompt?.id).toBe('a');
    expect(turns[0]!.response).toBeUndefined();
  });

  it('starts a new turn on every inbound, even with no reply between', () => {
    // Sending twice before the first answers must not merge the two prompts.
    const turns = groupTurns([msg('a', 'inbound'), msg('b', 'inbound')]);
    expect(turns.map((t) => t.id)).toEqual(['a', 'b']);
    expect(turns[1]!.response).toBeUndefined();
  });

  it('never loses a message', () => {
    const messages = [
      msg('greeting', 'outbound'),
      msg('a', 'inbound'),
      msg('b', 'outbound'),
      msg('c', 'inbound'),
      msg('d', 'outbound'),
      msg('e', 'outbound'),
      msg('f', 'inbound'),
    ];
    const seen = groupTurns(messages).flatMap((t) =>
      [t.prompt?.id, t.response?.id].filter(Boolean),
    );
    expect(seen).toEqual(messages.map((m) => m.id));
  });

  it('returns nothing for an empty thread', () => {
    expect(groupTurns([])).toEqual([]);
  });
});

describe('buildContextPreamble', () => {
  const ref = (over: Partial<ContextRef> = {}): ContextRef => ({
    id: 'n1',
    kind: 'page',
    label: 'Runbook',
    ...over,
  });

  it('is empty when there is no context, appending nothing to the message', () => {
    expect(buildContextPreamble([], [])).toBe('');
  });

  it('calls a node a node', () => {
    expect(buildContextPreamble([], [ref()])).toContain('(node n1)');
  });

  it('does NOT call an email id a node id', () => {
    // The whole reason NON_NODE_KINDS exists: an email's surface id is the
    // `emails` row id, so "node <id>" sends the agent's node tools after an id
    // that cannot resolve.
    const preamble = buildContextPreamble([], [ref({ kind: 'email', id: 'e7' })]);
    expect(preamble).toContain('(email id e7)');
    expect(preamble).not.toContain('node e7');
  });

  it('keeps that promise for every kind the set names', () => {
    // Guards the rule rather than today's single member, so adding a kind to
    // NON_NODE_KINDS cannot quietly skip this.
    for (const kind of NON_NODE_KINDS) {
      expect(buildContextPreamble([], [ref({ kind, id: 'x1' })])).toContain(`(${kind} id x1)`);
    }
  });

  it('sorts meta so the same ref always renders identically', () => {
    // Byte-identical preambles are what make a prompt cacheable and a diff
    // readable; object key order is not a stable enough promise to rely on.
    const a = buildContextPreamble([], [ref({ meta: { zeta: '1', alpha: '2' } })]);
    const b = buildContextPreamble([], [ref({ meta: { alpha: '2', zeta: '1' } })]);
    expect(a).toBe(b);
    expect(a).toContain('[alpha: 2, zeta: 1]');
  });

  it('drops empty meta values rather than sending a dangling key', () => {
    const preamble = buildContextPreamble([], [ref({ meta: { path: '', tab: 'rows' } })]);
    expect(preamble).toContain('[tab: rows]');
    expect(preamble).not.toContain('path');
  });

  it('omits the bracket entirely when a ref has no meta', () => {
    expect(buildContextPreamble([], [ref()])).toContain('(node n1)\n'.trimEnd());
    expect(buildContextPreamble([], [ref()])).not.toContain('[]');
  });

  it('names the pinned kind in the "you mean this X" phrasing', () => {
    // The label comes from pinned[0], so a drawing must not be called a page.
    const preamble = buildContextPreamble([ref({ kind: 'draw', label: 'Sketch' })], []);
    expect(preamble).toContain(`means it by "this ${CONTEXT_KIND_LABEL.draw}"`);
  });

  it('tells the responder to hand the id to a specialist verbatim', () => {
    // The delegation path is why the pinned block is phrased at all: the
    // responder often is not the one that edits the node.
    expect(buildContextPreamble([ref()], [])).toContain('verbatim');
  });

  it('separates pinned from attached, and emits only the sections in play', () => {
    const pinnedOnly = buildContextPreamble([ref()], []);
    expect(pinnedOnly).toContain('On screen right now');
    expect(pinnedOnly).not.toContain('Attached context');

    const pickedOnly = buildContextPreamble([], [ref()]);
    expect(pickedOnly).toContain('Attached context');
    expect(pickedOnly).not.toContain('On screen right now');

    const both = buildContextPreamble([ref()], [ref({ id: 'n2', label: 'Notes' })]);
    expect(both.indexOf('On screen right now')).toBeLessThan(both.indexOf('Attached context'));
  });

  it('lists every attached ref, one line each', () => {
    const preamble = buildContextPreamble(
      [],
      [ref({ id: 'n1' }), ref({ id: 'n2' }), ref({ id: 'n3' })],
    );
    expect(preamble.match(/^- /gm)).toHaveLength(3);
  });

  it('opens with the marker splitSentContext looks for', () => {
    // These two functions are a pair: the marker written here is the one the
    // transcript cuts on. If either side is edited alone, the reader starts
    // seeing the machine tail.
    expect(buildContextPreamble([ref()], [])).toMatch(/^\n\n---\nOn screen right now/);
    expect(buildContextPreamble([], [ref()])).toMatch(/^\n\n---\nAttached context/);
  });
});

describe('splitSentContext', () => {
  it('returns a plain message untouched, with nothing to reveal', () => {
    expect(splitSentContext('what changed in the runbook?')).toEqual({
      typed: 'what changed in the runbook?',
      appended: null,
    });
  });

  it('hides the pinned-context block the user never typed', () => {
    const typed = 'summarise this';
    const sent = typed + buildContextPreamble([{ id: 'n1', kind: 'page', label: 'Runbook' }], []);
    const split = splitSentContext(sent);
    expect(split.typed).toBe(typed);
    expect(split.appended).toContain('On screen right now');
  });

  it('hides the attached-context block too', () => {
    const typed = 'compare these';
    const sent = typed + buildContextPreamble([], [{ id: 'n1', kind: 'note', label: 'Notes' }]);
    expect(splitSentContext(sent).typed).toBe(typed);
  });

  it('cuts at the EARLIEST marker when a turn carries both', () => {
    // A turn can append context AND a focus directive. Cutting at the first
    // one is what keeps the second from leaking into the transcript.
    const sent =
      'fix the heading\n\n---\nOn screen right now — …\n- page "R" (node n1)\nFOCUS SET — block 3';
    const split = splitSentContext(sent);
    expect(split.typed).toBe('fix the heading');
    expect(split.appended).toContain('On screen right now');
    expect(split.appended).toContain('FOCUS SET');
  });

  it('cuts on a bare FOCUS SET with no context block', () => {
    const split = splitSentContext('tighten this\nFOCUS SET — block 3');
    expect(split.typed).toBe('tighten this');
    expect(split.appended).toBe('FOCUS SET — block 3');
  });

  it('trims the seam, keeping the rule that heads the appended block', () => {
    // The typed half loses its trailing whitespace; the appended half loses
    // only the blank line that separated them, and KEEPS the `---` rule — it
    // is what makes the revealed block read as a block in the tooltip.
    const split = splitSentContext(
      'ask   \n\n---\nAttached context (read these):\n- note "N" (node n1)',
    );
    expect(split.typed).toBe('ask');
    expect(split.appended?.startsWith('---\nAttached context')).toBe(true);
  });

  it('leaves a message that merely mentions the words alone', () => {
    // The markers are anchored to their newline prefixes, so prose about them
    // is not mistaken for them.
    const text = 'explain what On screen right now and FOCUS SET mean';
    expect(splitSentContext(text)).toEqual({ typed: text, appended: null });
  });

  it('round-trips whatever buildContextPreamble produced', () => {
    const typed = 'what is this?';
    for (const [pinned, picked] of [
      [[{ id: 'n1', kind: 'page' as const, label: 'R' }], []],
      [[], [{ id: 'e7', kind: 'email' as const, label: 'Thread' }]],
      [
        [{ id: 'n1', kind: 'table' as const, label: 'T', meta: { tab: 'rows' } }],
        [{ id: 'n2', kind: 'file' as const, label: 'F' }],
      ],
    ] as Array<[ContextRef[], ContextRef[]]>) {
      const sent = typed + buildContextPreamble(pinned, picked);
      expect(splitSentContext(sent).typed).toBe(typed);
    }
  });
});
