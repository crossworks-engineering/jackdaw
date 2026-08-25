import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Composer shell — THE outer casing for a create/edit form (and the odd
 * standalone content block) in a pane, style guide §6c. It was the same
 * class string hand-rolled across every composer; like `listCardClass`,
 * the chrome now has one source of truth.
 *
 * `bg-card/70`, not solid: the panes sit directly on the workspace's Neat
 * backdrop, and the shell was one of the last solid rectangles left — idle
 * ListCards carry the same 70. The border + shadow still separate the shell
 * from the pane, and §6c's point that the card "exposes any field that does
 * not match its siblings" survives the alpha.
 */
export const formShellClass = 'space-y-4 rounded-lg border border-border bg-card/70 p-5 shadow-sm';

export function FormShell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(formShellClass, className)} {...props} />;
}
