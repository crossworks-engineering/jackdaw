'use client';

import * as React from 'react';
import { GeneratedAvatar } from './generated-avatar';
import type { AvatarParts } from './avatar';
import { cn } from './lib/utils';

/**
 * A GeneratedAvatar with the agent's experience level pinned to its corner.
 * The level is a display-only readout of real accumulated work (see the
 * server's agent-experience rollup) — pass `title` with the component counts
 * so hovering explains WHY the agent is level N.
 *
 * `GeneratedAvatar`'s own wrapper is overflow-hidden and not `relative`, so
 * the badge lives on a relative sibling wrapper (the same pattern as the
 * app's other corner badges). The badge scales off `size` — callers range
 * from 28px table cells to 48px heroes and a fixed h-4 disc would swamp the
 * small ones.
 */
export function AvatarWithLevel({
  level,
  title,
  seed,
  parts,
  size = 40,
  className,
  containerStyle,
  badgeClassName,
}: {
  /** Experience level to badge. Absent/null (an older brain, or data not
   *  loaded yet) renders the plain avatar — never a fake "1". */
  level?: number | null;
  /** Tooltip explaining the level (turns, tool successes, …). */
  title?: string;
  seed: string;
  parts?: AvatarParts | null;
  size?: number;
  /** Forwarded to GeneratedAvatar (ring, border — decoration only). */
  className?: string;
  containerStyle?: React.CSSProperties;
  /** Override the badge ring for odd surfaces (default rings bg-background). */
  badgeClassName?: string;
}) {
  const avatar = (
    <GeneratedAvatar
      seed={seed}
      parts={parts}
      size={size}
      className={className}
      containerStyle={containerStyle}
    />
  );
  if (!level || level < 1) return avatar;
  const badgeH = Math.max(13, Math.round(size * 0.4));
  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <span
        className={cn(
          'absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-primary font-semibold leading-none text-primary-foreground ring-2 ring-background',
          badgeClassName,
        )}
        style={{
          height: badgeH,
          minWidth: badgeH,
          padding: '0 3px',
          // 9px floor — the codebase's smallest badge text is text-[9px];
          // 8px is illegible on the 28px table avatars.
          fontSize: Math.max(9, Math.round(badgeH * 0.6)),
        }}
        title={title}
        // role="img" makes the aria-label valid (a bare span is role
        // generic, where aria-label is prohibited and AT-ignored) so screen
        // readers hear "Level N", not a naked number.
        role="img"
        aria-label={title ?? `Level ${level}`}
      >
        {level}
      </span>
    </span>
  );
}
