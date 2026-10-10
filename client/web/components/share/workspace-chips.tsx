import { Badge } from '@mantle/web-ui/ui/badge';
import { cn } from '@mantle/web-ui/lib/utils';
// Relative, not '@/': the node test runner renders this (workspace-chips.test.ts).
import { chipsOf, workspacesOf } from '../../lib/grants';

/**
 * The workspaces an item is shared with, as a small row of name chips on a
 * card, a tree row or a detail title (plan 7.1; replaces AudienceBadge). At
 * most three, then "+N"; the title names them all. Nothing for a row that
 * carries no workspaces (a brain before W5b). `hub` (apps only) adds the
 * home app tag, as before, and `hasLink` the public pill (plan 8.1).
 */
export function WorkspaceChips({
  item,
  hub = false,
  compact = false,
  className,
}: {
  /** Any list row: its `workspaces` are read when present. */
  item: unknown;
  hub?: boolean;
  /** Smaller chips, for a tree row. */
  compact?: boolean;
  className?: string;
}) {
  const { shown, more, title } = chipsOf(workspacesOf(item));
  const size = compact ? 'px-1.5 py-0 text-[10px]' : undefined;
  // A live open link (plan 8.1: the "Public" pill, as before).
  const open = (item as { hasLink?: unknown } | null)?.hasLink === true;
  if (!hub && !open && shown.length === 0) return null;
  return (
    <span
      className={cn('inline-flex min-w-0 shrink-0 items-center gap-1', className)}
      title={title || undefined}
    >
      {hub && (
        <Badge className={cn('shrink-0', size)} title="Home app: members see it as their home">
          hub
        </Badge>
      )}
      {shown.map((w) => (
        <Badge key={w.id} variant="secondary" className={cn('max-w-28 shrink-0 truncate', size)}>
          {w.name}
        </Badge>
      ))}
      {open && (
        <Badge
          variant="outline"
          className={cn('shrink-0', size)}
          title="It has an open link: anyone with the link can open it"
        >
          public
        </Badge>
      )}
      {more > 0 && (
        <Badge variant="outline" className={cn('shrink-0', size)}>
          +{more}
          <span className="sr-only"> more workspaces</span>
        </Badge>
      )}
    </span>
  );
}
