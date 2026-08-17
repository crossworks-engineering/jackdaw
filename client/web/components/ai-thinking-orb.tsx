'use client';

import { ThinkingOrb, type OrbState } from 'thinking-orbs';

/** Map a live stage label ("Searching the web…", "Writing the reply…") to the
 *  orb animation that best matches the activity. Unrecognised or absent labels
 *  fall back to the generic 'working' orbit. */
export function orbStateForLabel(label?: string | null): OrbState {
  const l = (label ?? '').toLowerCase();
  if (/search|look|find|recall|brows/.test(l)) return 'searching';
  if (/writ|compos|repl|draft|summar|answer/.test(l)) return 'composing';
  if (/read|listen|transcrib|hear/.test(l)) return 'listening';
  if (/connect|fetch|call|tool|reach/.test(l)) return 'connecting';
  if (/think|reason|solv|plan|decid/.test(l)) return 'solving';
  return 'working';
}

/** The one thinking indicator for every "the AI is busy" surface: an inline
 *  20px thought orb (canvas, auto light/dark, reduced-motion aware) whose
 *  animation follows the current stage label. Decorative only, so callers keep
 *  their own sr-only/status text.
 */
export function AiThinkingOrb({
  label,
  className,
  style,
}: {
  label?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <ThinkingOrb
      state={orbStateForLabel(label)}
      size={20}
      className={className}
      style={style}
      aria-hidden
    />
  );
}
