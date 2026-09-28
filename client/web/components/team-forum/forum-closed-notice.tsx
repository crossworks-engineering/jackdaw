import Link from 'next/link';
import { Info } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { FORUM_CLOSED_TEXT } from '@/lib/forum-closed';

/**
 * The forum is closed (member logins, Phase 6): shown where a composer used
 * to be, and in place of the error when a write answers 410 forum-closed.
 * Reading stays open; a code holder gets their own login through /invite.
 */
export function ForumClosedNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium text-foreground">{FORUM_CLOSED_TEXT}</span> You can still read
        it here. Ask your admin for an invite, or enter your team code at{' '}
        <Link href="/invite" className="font-medium text-foreground underline underline-offset-2">
          /invite
        </Link>
        .
      </span>
    </p>
  );
}
