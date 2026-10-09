'use client';

/**
 * The banner on a member's item opened in its normal item screen
 * (workspace review pattern): who sent it and what waits, with the actions
 * beside it. Generic: the workspace hands in the words and the buttons.
 * It wraps on a phone (the actions drop below the words).
 */
import type { ReactNode } from 'react';
import { Inbox, Users } from 'lucide-react';

export function ReviewBanner({
  kind,
  text,
  detail,
  actions,
}: {
  kind: 'waiting' | 'shared';
  text: string;
  /** A second, quieter line (the version, the author's state). */
  detail?: ReactNode;
  actions: ReactNode;
}) {
  const Icon = kind === 'waiting' ? Inbox : Users;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-accent/40 px-3 py-2"
    >
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{text}</p>
          {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{actions}</div>
    </div>
  );
}
