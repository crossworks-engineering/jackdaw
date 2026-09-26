'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, LogOut, Menu, MessageSquare } from 'lucide-react';
import type { MemberShell as MemberShellData } from '@mantle/client-types';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { setAssetToken } from '@mantle/web-ui/asset-url';
import { performSignOut } from '@mantle/web-ui/sign-out';
import { ThemeToggle } from '@mantle/web-ui/theme-toggle';
import { Button } from '@mantle/web-ui/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@mantle/web-ui/ui/sheet';
import { TooltipProvider } from '@mantle/web-ui/ui/tooltip';
import { cn } from '@mantle/web-ui/lib/utils';
import { BrandBlock } from '@/components/layout/rail/brand-block';
import { NeatSurface } from '@/components/neat-surface';
import { assetTokenRefreshDelayMs } from '@mantle/web-ui/token-claims';
import { maybeRefreshToken } from '@mantle/web-ui/token-refresh';
import { setMemberHint } from '@/lib/member-destination';

const MemberContext = createContext<MemberShellData | null>(null);

/** The signed-in member's shell data. Only inside /m. */
export function useMember(): MemberShellData {
  const v = useContext(MemberContext);
  if (!v) throw new Error('useMember outside the member shell');
  return v;
}

const NAV = [
  { href: '/m', label: 'Library', icon: BookOpen },
  { href: '/m/chat', label: 'Chat', icon: MessageSquare },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/m'
    ? pathname === '/m' || pathname.startsWith('/m/items')
    : pathname.startsWith(href);
}

function RailNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/m';
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 scrollbar-thin">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function RailFoot({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-1 border-t border-sidebar-border px-2 py-2">
      <span className="min-w-0 flex-1 truncate px-1 text-sm text-sidebar-foreground/80">
        {name}
      </span>
      <ThemeToggle />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        title="Sign out"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMemberHint(false);
          await performSignOut();
          router.push('/login');
          router.refresh();
        }}
      >
        <LogOut />
      </Button>
    </div>
  );
}

/**
 * The member surface's chrome: a small rail (Library, Chat), the brain's
 * brand, and the signed-in member. Resolves the member from
 * /api/member/shell: an admin login is sent back to the owner app, no
 * session goes to /login (apiFetch does that on a 401).
 */
export function MemberShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const shell = useQuery({
    queryKey: ['member-shell'],
    queryFn: () => apiFetch<MemberShellData>('/api/member/shell'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 1,
    refetchInterval: (q) => assetTokenRefreshDelayMs(q.state.data?.assetToken),
    refetchOnWindowFocus: true,
  });

  // An admin login has no business here: its home is the owner app.
  useEffect(() => {
    const e = shell.error;
    if (e instanceof ApiError && e.status === 403) {
      setMemberHint(false);
      router.replace('/');
    }
  }, [shell.error, router]);

  // A member's browser skips the owner shell from now on (UX only), and a
  // split-client bearer is rotated before it expires, as the owner shell
  // does: without it a member's web session died at the 30-day TTL.
  const loaded = shell.isSuccess;
  useEffect(() => {
    if (!loaded) return;
    setMemberHint(true);
    void maybeRefreshToken();
  }, [loaded]);

  // Library images and file links carry the member asset token (?at=).
  useEffect(() => {
    setAssetToken(shell.data?.assetToken ?? null);
  }, [shell.data?.assetToken]);

  const data = shell.data;
  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {shell.isError ? 'Could not load.' : 'Loading…'}
        </p>
      </div>
    );
  }
  const name = data.displayName || data.email;
  const brand = (inDrawer: boolean) => (
    <BrandBlock
      siteName={data.siteName}
      peerName={null}
      logoVersion={data.logoVersion}
      logoDarkVersion={data.logoDarkVersion}
      href="/m"
      inDrawer={inDrawer}
      onNavigate={inDrawer ? () => setMobileNavOpen(false) : undefined}
    />
  );

  return (
    <MemberContext.Provider value={data}>
      <TooltipProvider delayDuration={0}>
        <div className="group/shell flex min-h-0 flex-1 flex-col" data-nav-collapsed="false">
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar px-2 md:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
                <SheetTitle className="sr-only">Sections</SheetTitle>
                {brand(true)}
                <RailNav onNavigate={() => setMobileNavOpen(false)} />
                <RailFoot name={name} />
              </SheetContent>
            </Sheet>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {data.siteName || 'Mantle'}
            </span>
          </header>
          <div className="relative flex min-h-0 flex-1">
            <aside className="relative hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
              {brand(false)}
              <RailNav />
              <RailFoot name={name} />
            </aside>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 right-0 md:left-56"
            >
              <NeatSurface shared />
            </div>
            {/* Scrolls on a phone, where the screens stack; on md and up each
                screen scrolls its own panes. */}
            <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto scrollbar-thin md:overflow-hidden">
              {children}
            </main>
          </div>
        </div>
      </TooltipProvider>
    </MemberContext.Provider>
  );
}
