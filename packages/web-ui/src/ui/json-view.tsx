'use client';

/**
 * JsonView: the one way the app shows a JSON blob to a person.
 *
 * A collapsible tree, coloured by type with the theme's `code-*` inks (AA in
 * every theme, light and dark), inside a bordered panel with a Copy button for
 * the whole value. It replaces `<pre>{JSON.stringify(x, null, 2)}</pre>`
 * wherever the reader is meant to INSPECT data. Where the text is meant to be
 * edited or copied as raw JSON (a form field, a request body), keep the text.
 *
 * In-house rather than a library: the candidates were @uiw/react-json-view
 * (v2 ships only as an alpha, with a @babel/runtime peer) and react18-json-view
 * (a global stylesheet plus its own dark-mode class). Neither pages a large
 * array, and both bring a colour scheme to fight. This is a few hundred lines
 * on the kit's own tokens and primitives.
 *
 * Behaviour:
 * - A string is parsed when it holds a JSON object or array; any other string
 *   is shown as plain text (a tool output is often either).
 * - The first `collapseDepth` levels start open; deeper nodes start closed. A
 *   node with more than one page of children always starts closed.
 * - Children render a page at a time, so a 10k-item array cannot freeze the tab.
 * - Long strings are clipped with a "show all" toggle.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, X } from 'lucide-react';
import { Button } from './button';
import { RowButton } from './row-button';
import { cn } from '../lib/utils';
import { copyText } from '../lib/secure-context-fallbacks';

/** Children per page inside one node. */
export const JSON_CHILD_PAGE = 100;
/** A string longer than this is clipped until the reader asks for all of it. */
export const JSON_STRING_CLIP = 240;
/** Levels open on first render when the caller does not say. */
export const JSON_DEFAULT_DEPTH = 2;

export type JsonInput = { kind: 'tree'; value: unknown } | { kind: 'text'; text: string };

/**
 * Decide how to show a value. A string that parses to an object or array is a
 * tree; any other string stays text (so `"42"` or `"hello"` reads as written).
 * Everything else is a tree, primitives included.
 */
export function toJsonInput(value: unknown): JsonInput {
  if (typeof value !== 'string') return { kind: 'tree', value };
  const t = value.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(t);
      if (parsed !== null && typeof parsed === 'object') return { kind: 'tree', value: parsed };
    } catch {
      // Not JSON after all: fall through to text.
    }
  }
  return { kind: 'text', text: value };
}

/** Whether a node at `depth` (root = 0) starts open. */
export function startsOpen(depth: number, collapseDepth: number, childCount: number): boolean {
  return depth < collapseDepth && childCount <= JSON_CHILD_PAGE;
}

/** The text the Copy button puts on the clipboard. Never throws. */
export function jsonCopyText(input: JsonInput): string {
  if (input.kind === 'text') return input.text;
  return safeStringify(input.value, 2);
}

function safeStringify(value: unknown, indent?: number): string {
  try {
    const s = JSON.stringify(
      value,
      (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
      indent,
    );
    return s ?? String(value);
  } catch {
    return String(value);
  }
}

function entriesOf(value: object): Array<[string, unknown]> {
  return Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

type CopyState = 'idle' | 'copied' | 'failed';

/** Copy with inline feedback (no toast: copying is frequent). A failed copy
 *  says so, so the reader knows to select the text by hand. */
function useCopy(): [CopyState, (text: string) => void] {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (text: string) => {
    void copyText(text).then((ok) => {
      setState(ok ? 'copied' : 'failed');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), 1500);
    });
  };
  return [state, copy];
}

function RowCopy({ text, what }: { text: string; what: string }) {
  const [state, copy] = useCopy();
  return (
    <Button
      variant="ghost"
      size="icon-2xs"
      className="invisible shrink-0 text-muted-foreground group-hover:visible group-focus-within:visible"
      aria-label={`Copy ${what}`}
      title={`Copy ${what}`}
      onClick={() => copy(text)}
    >
      {state === 'copied' ? <Check /> : state === 'failed' ? <X /> : <Copy />}
    </Button>
  );
}

function StringValue({ value }: { value: string }) {
  const [full, setFull] = useState(false);
  const clipped = !full && value.length > JSON_STRING_CLIP;
  return (
    <span className="whitespace-pre-wrap break-all text-code-string">
      &quot;{clipped ? value.slice(0, JSON_STRING_CLIP) : value}
      {clipped && '…'}&quot;
      {value.length > JSON_STRING_CLIP && (
        <RowButton
          className="ml-1.5 rounded px-1 font-sans text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setFull((f) => !f)}
        >
          {full ? 'show less' : `show all (${value.length.toLocaleString()} chars)`}
        </RowButton>
      )}
    </span>
  );
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="italic text-code-keyword">null</span>;
  switch (typeof value) {
    case 'string':
      return <StringValue value={value} />;
    case 'number':
    case 'bigint':
      return <span className="text-code-number">{String(value)}</span>;
    case 'boolean':
      return <span className="text-code-keyword">{String(value)}</span>;
    case 'undefined':
      return <span className="italic text-muted-foreground">undefined</span>;
    default:
      return <span className="text-muted-foreground">{String(value)}</span>;
  }
}

function KeyLabel({ name, index }: { name: string; index: boolean }) {
  return (
    <>
      {index ? (
        <span className="text-muted-foreground">{name}</span>
      ) : (
        <span className="text-code-title">&quot;{name}&quot;</span>
      )}
      <span className="text-muted-foreground">: </span>
    </>
  );
}

function JsonNode({
  name,
  isIndex,
  value,
  path,
  depth,
  collapseDepth,
}: {
  name: string | null;
  isIndex: boolean;
  value: unknown;
  path: string;
  depth: number;
  collapseDepth: number;
}) {
  const isContainer = value !== null && typeof value === 'object';
  const entries = isContainer ? entriesOf(value) : [];
  const [open, setOpen] = useState(() => startsOpen(depth, collapseDepth, entries.length));
  const [shown, setShown] = useState(JSON_CHILD_PAGE);
  const where = path || 'value';

  if (!isContainer || entries.length === 0) {
    return (
      <div className="group flex items-start gap-1 rounded pl-4 pr-1 hover:bg-muted/60">
        <span className="min-w-0 flex-1">
          {name !== null && <KeyLabel name={name} index={isIndex} />}
          {isContainer ? (
            <span className="text-muted-foreground">{Array.isArray(value) ? '[]' : '{}'}</span>
          ) : (
            <Primitive value={value} />
          )}
        </span>
        <RowCopy text={typeof value === 'string' ? value : safeStringify(value, 2)} what={where} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const count = isArray
    ? plural(entries.length, 'item', 'items')
    : plural(entries.length, 'key', 'keys');

  return (
    <div>
      <div className="group flex items-start gap-1 rounded pr-1 hover:bg-muted/60">
        <RowButton
          className="flex min-w-0 flex-1 items-center gap-0.5 rounded"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">
            {name !== null && <KeyLabel name={name} index={isIndex} />}
            <span className="text-muted-foreground">
              {isArray ? '[' : '{'}
              {!open && (
                <>
                  <span className="mx-1 font-sans text-[11px]">{count}</span>
                  {isArray ? ']' : '}'}
                </>
              )}
            </span>
          </span>
        </RowButton>
        <RowCopy text={safeStringify(value, 2)} what={where} />
      </div>
      {open && (
        <div className="ml-[7px] border-l border-border pl-1.5">
          {entries.slice(0, shown).map(([k, v]) => (
            <JsonNode
              key={k}
              name={k}
              isIndex={isArray}
              value={v}
              path={isArray ? `${path}[${k}]` : path ? `${path}.${k}` : k}
              depth={depth + 1}
              collapseDepth={collapseDepth}
            />
          ))}
          {entries.length > shown && (
            <RowButton
              className="ml-4 rounded px-1 font-sans text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShown((s) => s + JSON_CHILD_PAGE)}
            >
              Show {Math.min(JSON_CHILD_PAGE, entries.length - shown).toLocaleString()} more (
              {(entries.length - shown).toLocaleString()} hidden)
            </RowButton>
          )}
        </div>
      )}
      {open && <div className="pl-4 text-muted-foreground">{isArray ? ']' : '}'}</div>}
    </div>
  );
}

function summarize(input: JsonInput): string {
  if (input.kind === 'text') return 'text';
  const v = input.value;
  if (Array.isArray(v)) return plural(v.length, 'item', 'items');
  if (v !== null && typeof v === 'object') return plural(Object.keys(v).length, 'key', 'keys');
  return v === null ? 'null' : typeof v;
}

export interface JsonViewProps {
  /** Any value. A string holding a JSON object or array is parsed first. */
  value: unknown;
  /** Levels open on first render (root = level 1). Default 2. */
  collapseDepth?: number;
  /** Height cap of the scroll area, in px, or 'none'. Default 384. */
  maxHeight?: number | 'none';
  /** A short title for the header row, e.g. "Input". */
  label?: string;
  className?: string;
}

export function JsonView({
  value,
  collapseDepth = JSON_DEFAULT_DEPTH,
  maxHeight = 384,
  label,
  className,
}: JsonViewProps) {
  const input = toJsonInput(value);
  const [copyState, copy] = useCopy();
  // Expand all / Collapse all remount the tree with a new starting depth.
  const [view, setView] = useState({ depth: collapseDepth, gen: 0 });
  const hasChildren =
    input.kind === 'tree' &&
    input.value !== null &&
    typeof input.value === 'object' &&
    entriesOf(input.value).length > 0;

  return (
    <div className={cn('min-w-0 rounded-md border border-border bg-muted/30 text-xs', className)}>
      {/* Wraps in a narrow pane: the buttons drop to their own line, never clip. */}
      <div className="flex flex-wrap items-center gap-x-1.5 border-b border-border py-0.5 pl-2.5 pr-1">
        {label && <span className="whitespace-nowrap font-medium text-foreground">{label}</span>}
        <span className="whitespace-nowrap text-muted-foreground">{summarize(input)}</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-0.5">
          {hasChildren && (
            <>
              <Button
                variant="ghost"
                size="2xs"
                className="text-muted-foreground"
                onClick={() => setView((s) => ({ depth: Infinity, gen: s.gen + 1 }))}
              >
                Expand all
              </Button>
              <Button
                variant="ghost"
                size="2xs"
                className="text-muted-foreground"
                onClick={() => setView((s) => ({ depth: 1, gen: s.gen + 1 }))}
              >
                Collapse
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="2xs"
            className="text-muted-foreground"
            aria-label={label ? `Copy ${label}` : 'Copy JSON'}
            onClick={() => copy(jsonCopyText(input))}
          >
            {copyState === 'copied' ? <Check /> : copyState === 'failed' ? <X /> : <Copy />}
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
          </Button>
        </span>
      </div>
      <div
        className="overflow-auto scrollbar-thin px-1 py-1.5 font-mono text-xs leading-5"
        style={maxHeight === 'none' ? undefined : { maxHeight }}
      >
        {input.kind === 'text' ? (
          <pre className="whitespace-pre-wrap break-words px-1.5 font-mono text-foreground">
            {input.text || '(empty)'}
          </pre>
        ) : (
          <JsonNode
            key={view.gen}
            name={null}
            isIndex={false}
            value={input.value}
            path=""
            depth={0}
            collapseDepth={view.depth}
          />
        )}
      </div>
    </div>
  );
}
