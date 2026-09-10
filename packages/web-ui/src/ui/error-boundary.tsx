'use client';

import * as React from 'react';
import { Button } from './button';
import { cn } from '../lib/utils';

/**
 * A boundary around ONE heavy surface, so its failure costs that surface and
 * nothing else.
 *
 * Next's `error.tsx` already catches a render throw, but it catches it at the
 * ROUTE: a bad scene in the drawing canvas, a malformed node in the page
 * editor, a column definition the grid cannot read — any of them replaced the
 * whole screen, list panel and toolbar included, and left no way back except a
 * reload. The four surfaces this wraps are the ones that parse documents
 * written elsewhere (Excalidraw scenes, TipTap JSON, table schemas, an app's
 * own bundle), which is exactly the input a boundary is for.
 *
 * **It resets two ways**, because a boundary with no way out is worse than the
 * crash it caught:
 *
 * - "Try again" remounts the subtree. Enough for a transient failure — a race
 *   during load, a chunk that arrived half-written.
 * - `resetKeys` clears the error whenever the thing being viewed changes. A
 *   drawing that will not open must not make the NEXT drawing unopenable, and
 *   without this it would: the boundary has no idea the id changed.
 */
type Props = {
  children: React.ReactNode;
  /**
   * What broke, as a noun phrase for the middle of a sentence — "the drawing
   * canvas", "this table". It is the whole message, so make it the thing the
   * reader is looking at rather than the component's name.
   */
  label: string;
  /** Changing any of these clears a caught error. Pass the id being viewed. */
  resetKeys?: readonly unknown[];
  /** Extra classes on the fallback, for surfaces that need it to fill a pane. */
  className?: string;
};

type State = { error: Error | null; generation: number };

export class SurfaceErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null, generation: 0 };
  /** The keys as they were when the error was caught, to compare against. */
  private caughtAt: readonly unknown[] = [];

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The route boundary logs; so does this one. Without it a caught error is
    // invisible — the fallback renders and the console stays clean, which is
    // the failure mode that makes a boundary worse than no boundary.
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  override componentDidUpdate() {
    // While healthy, track the keys — so that when a throw does land, this
    // holds what was on screen at the time and a later change is detectable.
    if (!this.state.error) {
      this.caughtAt = this.props.resetKeys ?? [];
      return;
    }
    if (keysChanged(this.caughtAt, this.props.resetKeys ?? [])) {
      this.setState((s) => ({ error: null, generation: s.generation + 1 }));
    }
  }

  private retry = () => {
    this.setState((s) => ({ error: null, generation: s.generation + 1 }));
  };

  override render() {
    if (!this.state.error) {
      // The generation key is what makes "Try again" a REMOUNT rather than a
      // re-render: the subtree that threw is discarded along with whatever
      // state got it there.
      return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
    }
    return (
      <div
        role="alert"
        className={cn(
          'flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center',
          this.props.className,
        )}
      >
        <p className="text-sm font-medium text-destructive-ink">
          Something went wrong loading {this.props.label}.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The rest of this screen still works. Try again, or reload the page — the details are in
          the browser console.
        </p>
        <Button size="sm" variant="outline" onClick={this.retry}>
          Try again
        </Button>
      </div>
    );
  }
}

/** Shallow, `Object.is` per element — the same comparison React uses on deps. */
function keysChanged(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((v, i) => !Object.is(v, b[i]));
}
