/**
 * Does this brain filter lists by the switcher's workspace (W5b part B)?
 * Known only from a list answer: a brain that filters echoes the `ws` it was
 * asked for. Until one does, the switcher says the lists still show every
 * workspace (never a false claim; CEO audit H1).
 */
import { useSyncExternalStore } from 'react';

let honoured = false;
const listeners = new Set<() => void>();

/** Look at a list answer asked with `ws`. Returns the answer unchanged. */
export function noteListAnswer<T>(answer: T, ws: string | null | undefined): T {
  if (!honoured && ws && (answer as { ws?: unknown } | null)?.ws === ws) {
    honoured = true;
    for (const l of listeners) l();
  }
  return answer;
}

export function wsFilterHonoured(): boolean {
  return honoured;
}

/** For tests only: forget what was seen. */
export function resetWsFilterSeen(): void {
  honoured = false;
  for (const l of listeners) l();
}

export function useWsFilterHonoured(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => honoured,
    () => false,
  );
}
