'use client';

import type { ReactNode } from 'react';
import { ItemHeader } from '../layout/item-header';
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
 * Reject, the View menu) come first, and the icon-only set every app has
 * (Access, Focus, Open, Delete, Restart test) sits at the far right, in that
 * group. An icon-only button always carries its name (aria-label) and a
 * tooltip: use `HeaderIconButton`. The layout is the generic `ItemHeader`.
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
    <ItemHeader
      lead={lead}
      visual={tile ?? <AppTile icon={icon} color={color} size="md" />}
      title={title || 'Untitled'}
      badges={badges}
      subtitle={subtitle}
      textActions={textActions}
      iconActions={iconActions}
      actionsLabel="App actions"
      testIds={{
        root: 'app-item-header',
        text: 'app-header-text-actions',
        icons: 'app-header-icon-actions',
      }}
    />
  );
}

// The header buttons live with the generic header; re-exported for Apps.
export { HeaderIconButton, HeaderInfoButton } from '../layout/item-header';
