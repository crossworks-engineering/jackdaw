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

/**
 * Prefer this over spreading {@link formShellClass} onto a bare `div`: it
 * carries `data-slot="form-shell"`, and that attribute is the only stable way
 * to point at a composer from the outside.
 *
 * Two e2e specs used to find the shell by its utility classes
 * (`div.rounded-lg.border.bg-card`), which stopped matching the day the shell
 * went translucent — `bg-card/70` is a different class token from `bg-card`,
 * so the selector silently matched nothing while the screens were fine. The
 * suite could not run at the time, so nobody heard about it. A visual choice
 * should never be able to break a test that is not about the visuals, and a
 * `data-slot` cannot drift the way a class list does.
 */
export function FormShell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="form-shell" className={cn(formShellClass, className)} {...props} />;
}
