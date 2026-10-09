'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import type { AppTint } from '@mantle/client-types';
import { AppTile } from './app-tile';

/**
 * The one header an app has in the Apps pane, a brain app and a member's app
 * under review alike: ONE row, the same height for both (2026-10-09). Its
 * tile, title and state (pills, level, a version), a short line beside them
 * (cut to fit), then the actions. Anything longer (who sent it, a test run's
 * notice) goes behind an Info button in the icon group: `HeaderInfoButton`.
 *
 * The actions follow one rule (2026-10-09): the buttons with words (Approve,
 * Send back, the View menu) come first, and the icon-only set every app has
 * (Access, Focus, Open, Delete, Restart test) sits at the far right, in that
 * group. An icon-only button always carries its name (aria-label) and a
 * tooltip: use `HeaderIconButton`.
 */
export function AppItemHeader({
  lead,
  icon,
  color,
  title,
  badges,
  subtitle,
  textActions,
  iconActions,
  tile,
}: {
  /** Before the tile: a way back (the app's own screen). */
  lead?: ReactNode;
  /** In place of the plain tile (the editor's look picker). */
  tile?: ReactNode;
  icon: string | null;
  color: AppTint | null;
  title: string;
  /** After the title: pills, level, a version, a state. */
  badges?: ReactNode;
  /** A short line beside the title (its description), cut to fit. */
  subtitle?: ReactNode;
  /** Buttons with words: left of the icon group. */
  textActions?: ReactNode;
  /** Icon-only buttons: the group at the far right. */
  iconActions?: ReactNode;
}) {
  return (
    <div
      data-testid="app-item-header"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3"
    >
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        {lead}
        <h2 className="flex min-w-0 shrink-0 items-center gap-2 text-lg font-semibold">
          {tile ?? <AppTile icon={icon} color={color} size="md" />}
          <span className="min-w-0 truncate">{title || 'Untitled'}</span>
          {badges}
        </h2>
        {subtitle ? (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {textActions ? (
          <div data-testid="app-header-text-actions" className="flex flex-wrap items-center gap-2">
            {textActions}
          </div>
        ) : null}
        {iconActions ? (
          <div
            role="group"
            aria-label="App actions"
            data-testid="app-header-icon-actions"
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

/** The icon-only Info button: what does not fit the one header row (who
 *  sent it, when, a test run's notice), in a small popover. */
export function HeaderInfoButton({
  label = 'About this app',
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
