'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Inbox, Send } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@mantle/web-ui/ui/sheet';
import { AreaBackdrop } from '@mantle/web-ui/area-backdrop';
import { NeatSurface } from '@/components/neat-surface';
import { BrandBlock } from '@/components/layout/rail/brand-block';
import { MobileBar } from '@/components/layout/rail/mobile-bar';
import { RailControls } from '@/components/layout/rail/rail-controls';
import { NAV_W_DEFAULT } from '@/lib/nav-width';
import { clientRedirectFor } from '@/lib/client-surface';
import { CLIENT_VIEW_HREF, clientViewOf, type ClientView } from '@/lib/client-requests';
import type { ClientShell } from '@mantle/client-types';
import { ClientChatDock, ClientChatProvider } from './client-chat';
import { ClientHome } from './client-home';
import { ClientRequests } from './client-requests';

/** The public paths a client may stand on; everything else is the home. */
const CLIENT_PUBLIC: readonly string[] = [];

/** The client's two screens, in the rail's order. */
const CLIENT_NAV: readonly { view: ClientView; label: string; icon: typeof Inbox }[] = [
  { view: 'shared', label: 'Shared with you', icon: Inbox },
  { view: 'requests', label: 'My requests', icon: Send },
];

/** The rail's links. `?view=` picks the screen (both live at `/`). */
function ClientNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/';
  const current = clientViewOf(useSearchParams());
  return (
    <nav className="flex flex-col gap-0.5 px-3 py-3" aria-label="Primary">
      {CLIENT_NAV.map(({ view, label, icon: Icon }) => {
        const active = pathname === '/' && current === view;
        return (
          <Link
            key={view}
            href={CLIENT_VIEW_HREF[view]}
            onClick={() => onNavigate?.()}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate text-left">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The screen the URL names: "Shared with you", or My requests (C5). */
function ClientScreen() {
  return clientViewOf(useSearchParams()) === 'requests' ? <ClientRequests /> : <ClientHome />;
}

/**
 * The client chrome (client logins C2), the member chrome cut down to what a
 * client has: the brand (its name or logo, never a staff name or the peer
 * name), the account menu (name, theme, sign out, sign out everywhere),
 * two screens, "Shared with you" and My requests (C5, what the client wrote
 * and sent for review), and the client's own chat (C4, a dock the screens
 * open). No search, no activity, no owner assistant, no upload dock, no
 * tour. The rail is a drawer below md, as in the owner shell.
 *
 * Any other path a client lands on (before the middleware knew it was a
 * client) is replaced with the home, the item open when the path named one.
 */
export function ClientShellFrame({ shell }: { shell: ClientShell }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const to = clientRedirectFor(pathname, CLIENT_PUBLIC);
    if (to) router.replace(to);
  }, [pathname, router]);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const identity = {
    displayName: shell.displayName,
    email: shell.email,
    avatar: null,
    photoVersion: null,
  };

  const body = (onNavigate?: () => void, inDrawer = false) => (
    <>
      <BrandBlock
        siteName={shell.siteName}
        logoVersion={shell.logoVersion}
        logoDarkVersion={shell.logoDarkVersion}
        inDrawer={inDrawer}
        onNavigate={onNavigate}
      />
      <RailControls identity={identity} onNavigate={onNavigate} client />
      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <Suspense fallback={null}>
          <ClientNav onNavigate={onNavigate} />
        </Suspense>
      </div>
    </>
  );

  return (
    <ClientChatProvider>
      <div
        className="mantle-shell group/shell h-screen bg-background"
        data-nav-collapsed="false"
        data-client-shell=""
        style={
          {
            '--nav-w': `${NAV_W_DEFAULT}px`,
            '--activity-w': '0px',
            '--assistant-w': '0rem',
            '--help-w': '0rem',
          } as React.CSSProperties
        }
      >
        <MobileBar
          identity={identity}
          siteName={shell.siteName}
          logoVersion={shell.logoVersion}
          logoDarkVersion={shell.logoDarkVersion}
          onMenuClick={() => setMobileOpen(true)}
          client
        />
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--nav-w)] flex-col border-r bg-sidebar md:flex">
          <AreaBackdrop area="menu" />
          {body()}
        </aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {body(() => setMobileOpen(false), true)}
          </SheetContent>
        </Sheet>
        {/* The brain's saved background, as a shared-out surface (the share
          switch applies), under <main> and never scrolling with it. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 top-[var(--top-bar-h)] md:left-[var(--nav-w)]"
        >
          <NeatSurface shared />
        </div>
        <main className="fixed inset-0 top-[var(--top-bar-h)] overflow-y-auto scrollbar-thin md:left-[var(--nav-w)]">
          <Suspense fallback={null}>
            <ClientScreen />
          </Suspense>
        </main>
        <ClientChatDock />
      </div>
    </ClientChatProvider>
  );
}
