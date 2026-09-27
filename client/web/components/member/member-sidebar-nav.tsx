'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookText,
  FileText,
  FolderTree,
  Home,
  MessageSquare,
  PenTool,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { useAssistantDock } from '@/components/assistant/assistant-dock';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@mantle/web-ui/ui/tooltip';

/** `chat` opens the assistant dock beside the current screen instead of
 *  navigating (member logins, Phase 3). */
type Item = { name: string; href: string; icon: LucideIcon; chat?: true };

/** What a member reaches (member logins, plan section 7): their home, the five
 *  workspace kinds (each with Mine, Team drafts and the Library), and chat. */
export const MEMBER_NAV: { label: string; items: Item[] }[] = [
  { label: 'Home', items: [{ name: 'Home', href: '/', icon: Home }] },
  {
    label: 'Workspace',
    items: [
      { name: 'Pages', href: '/pages', icon: BookText },
      { name: 'Notes', href: '/notes', icon: FileText },
      { name: 'Draw', href: '/draw', icon: PenTool },
      { name: 'Tables', href: '/tables', icon: Table2 },
      { name: 'Files', href: '/files', icon: FolderTree },
    ],
  },
  { label: 'Assistant', items: [{ name: 'Chat', href: '#chat', icon: MessageSquare, chat: true }] },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The member's rail nav: a short fixed list, so no filter box, no scope
 * toggle, no favourites (those are stored brain-wide) and no live badges (the
 * brain's event stream and approval counts are admin-only).
 */
export function MemberSidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? '/';
  const { panel, openAssistant } = useAssistantDock();
  return (
    <TooltipProvider delayDuration={0}>
      <nav
        className="flex flex-col gap-4 px-3 py-3 group-data-[nav-collapsed=true]/shell:px-2"
        aria-label="Primary"
      >
        {MEMBER_NAV.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-data-[nav-collapsed=true]/shell:hidden">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = item.chat ? panel === 'open' : isActive(pathname, item.href);
              const Icon = item.icon;
              const cls = cn(
                'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:gap-0 group-data-[nav-collapsed=true]/shell:px-0',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
              );
              const inner = (
                <>
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1 truncate text-left group-data-[nav-collapsed=true]/shell:hidden">
                    {item.name}
                  </span>
                </>
              );
              const link = item.chat ? (
                <Button
                  key={item.href}
                  variant="ghost"
                  onClick={() => {
                    onNavigate?.();
                    openAssistant();
                  }}
                  aria-pressed={active}
                  className={cn(cls, 'h-auto w-full justify-start')}
                >
                  {inner}
                </Button>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  aria-current={active ? 'page' : undefined}
                  className={cls}
                >
                  {inner}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}
