'use client';

import { usePathname } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { mayOpenPath } from '@/lib/workspaces';
import { useShellWorkspaces } from './use-shell-workspaces';

/** What a screen the login may not manage says instead of itself. */
export const AREA_REFUSED_TEXT = 'You cannot manage this part of the brain.';

/**
 * Keeps a settings screen closed to a login without its area (plan 1.4,
 * requireArea; plan 7.1: screens hide by the areas /api/shell names). The
 * nav already leaves the screen out; this covers a typed or old link. The
 * brain refuses the requests anyway: this only stops a screen of errors.
 *
 * Wraps nothing else: the children render as they are.
 */
export function AreaGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const areas = useShellWorkspaces()?.areas;
  if (mayOpenPath(areas, pathname)) return <>{children}</>;
  return <AreaRefused />;
}

export function AreaRefused() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      <ShieldOff className="mr-2 size-4" aria-hidden /> {AREA_REFUSED_TEXT}
    </div>
  );
}
