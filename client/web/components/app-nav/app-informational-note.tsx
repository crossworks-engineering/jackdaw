'use client';

import { Info } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { APP_INFORMATIONAL_NOTE, APP_INFORMATIONAL_TAG } from '@/lib/app-informational';

/**
 * The quiet line on an informational app (client logins C6): a member or a
 * client reads its data and changes none. Said once beside the app, never a
 * banner over it: the app still works for reading.
 */
export function AppInformationalNote({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn('flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      <Info className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{APP_INFORMATIONAL_NOTE}</span>
    </p>
  );
}

/** The same, as a tag on a launcher card: the full line on hover. */
export function AppInformationalTag() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={APP_INFORMATIONAL_NOTE}
    >
      <Info className="size-3" aria-hidden />
      {APP_INFORMATIONAL_TAG}
    </span>
  );
}
