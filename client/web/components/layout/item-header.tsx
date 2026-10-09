'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import { cn } from '@mantle/web-ui/lib/utils';

/**
 * The one header a detail pane has (2026-10-09): ONE row, the same height on
 * every screen. A leading mark, the title and its state (pills, a count), a
 * short line beside them (cut to fit), then the actions. Anything longer goes
 * behind an Info button in the icon group: `HeaderInfoButton`. No banners and
 * no second header row under it.
 *
 * The actions follow one rule: the buttons with words come first, and the
 * icon-only set sits at the far right, in its own group. An icon-only button
 * always carries its name (aria-label) and a tooltip: use `HeaderIconButton`.
 *
 * The Apps pane's `AppItemHeader` is this with an app tile; Settings > Logins
 * uses it for a login, an invite and the client steps.
 */
export function ItemHeader({
  lead,
  visual,
  title,
  badges,
  subtitle,
  textActions,
  iconActions,
  actionsLabel = 'Actions',
  sticky = false,
  testIds,
}: {
  /** Before the mark: a way back. */
  lead?: ReactNode;
  /** Beside the title: a tile or an icon. */
  visual?: ReactNode;
  title: ReactNode;
  /** After the title: pills, a level, a count, a state. */
  badges?: ReactNode;
  /** A short line beside the title, cut to fit. */
  subtitle?: ReactNode;
  /** Buttons with words: left of the icon group. */
  textActions?: ReactNode;
  /** Icon-only buttons: the group at the far right. */
  iconActions?: ReactNode;
  /** The icon group's accessible name. */
  actionsLabel?: string;
  /** Stays at the top while the pane under it scrolls (a pane that is one
   *  scroller, header included). */
  sticky?: boolean;
  /** The test hooks a screen already pins (the Apps pane's). */
  testIds?: { root?: string; text?: string; icons?: string };
}) {
  return (
    <div
      data-testid={testIds?.root ?? 'item-header'}
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3',
        sticky && 'sticky top-0 z-10 bg-background',
      )}
    >
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        {lead}
        <h2 className="flex min-w-0 shrink-0 items-center gap-2 text-lg font-semibold">
          {visual}
          <span className="min-w-0 truncate">{title}</span>
          {badges}
        </h2>
        {subtitle ? (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {textActions ? (
          <div
            data-testid={testIds?.text ?? 'item-header-text-actions'}
            className="flex flex-wrap items-center gap-2"
          >
            {textActions}
          </div>
        ) : null}
        {iconActions ? (
          <div
            role="group"
            aria-label={actionsLabel}
            data-testid={testIds?.icons ?? 'item-header-icon-actions'}
            className="flex items-center gap-1"
          >
            {iconActions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** An icon-only header button: its name is both the aria-label and the
 *  tooltip, so the icon is never the only way to know what it does. */
export function HeaderIconButton({
  label,
  tooltip,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'title' | 'size'> & {
  label: string;
  /** A longer tooltip than the name, when it helps. */
  tooltip?: string;
}) {
  return (
    <Button size="icon-sm" variant="ghost" aria-label={label} title={tooltip ?? label} {...props}>
      {children}
    </Button>
  );
}

/** The icon-only Info button: what does not fit the one header row, in a
 *  small popover. */
export function HeaderInfoButton({
  label = 'About this',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <HeaderIconButton label={label}>
          <Info />
        </HeaderIconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-sm">
        {children}
      </PopoverContent>
    </Popover>
  );
}
