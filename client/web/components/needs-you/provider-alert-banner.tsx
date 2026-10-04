'use client';

/**
 * Embeddings or extraction failing (no credits, a refused key, a long
 * outage): a red notice at the top of the rail, above the "Needs you" one,
 * for admins only. Live through the "Needs you" answer (the brain raises
 * `needs_you` when an outage opens or closes). Renders NOTHING while all
 * works. Clicking opens the settings page with the fix. In the collapsed
 * icon rail the label hides and the icon stays.
 */
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import {
  alertHeadline,
  alertHref,
  alertImpact,
  alertTitle,
  providerAlertsOf,
} from '@/lib/provider-alerts';
import { useNeedsYou } from './use-needs-you';

export function ProviderAlertBanner({ onNavigate }: { onNavigate?: () => void }) {
  const alerts = providerAlertsOf(useNeedsYou());
  const first = alerts[0];
  if (!first) return null;
  const label = alerts.length > 1 ? 'Embeddings and extraction are failing' : alertTitle(first);
  const detail = alerts.map((a) => `${alertHeadline(a)} ${alertImpact(a)}`).join('\n');
  return (
    <div className="px-3 pt-3 group-data-[nav-collapsed=true]/shell:px-2">
      <Link
        href={alertHref(first)}
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:px-0 group-data-[nav-collapsed=true]/shell:py-2"
        title={detail}
        aria-label={detail}
        data-testid="provider-alert-banner"
      >
        <AlertTriangle className="size-4 shrink-0" />
        <span className="truncate group-data-[nav-collapsed=true]/shell:hidden">{label}</span>
      </Link>
    </div>
  );
}
