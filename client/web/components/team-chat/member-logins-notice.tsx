import Link from 'next/link';
import { Info } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';

/**
 * The old team-code surfaces (the token gate, the team workspace) point at
 * member logins (Phase 6): a code holder asks for an invite, or redeems their
 * team code once at /invite while the admin has an open invite for them.
 */
export function MemberLoginsNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        This brain now uses member logins. Ask your admin for an invite, or enter your team code at{' '}
        <Link href="/invite" className="font-medium text-foreground underline underline-offset-2">
          /invite
        </Link>
        .
      </span>
    </p>
  );
}
