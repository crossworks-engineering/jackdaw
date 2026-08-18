import { SlidersHorizontal } from 'lucide-react';
import { SetPageTitle } from '@/components/layout/page-title';

/**
 * `/settings` — the hub's own landing state.
 *
 * The route was unclaimed until now, which is exactly why the hub sits here: no
 * redirect, no new vocabulary, and every existing `/settings/<name>` bookmark
 * keeps working.
 *
 * An explainer rather than a redirect to the first card. A redirect would mean
 * "Settings" in the sidebar could never be a place you land — the back button
 * would bounce you off it — and it would pick Profile as the answer to a
 * question the reader has not asked yet.
 */
export default function SettingsHubPage() {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <SetPageTitle title="Settings" />
      <div className="max-w-sm space-y-2 text-sm text-muted-foreground">
        <SlidersHorizontal className="mx-auto size-6" aria-hidden />
        <p>Pick a setting on the left.</p>
        <p className="text-xs">
          Collections — accounts, agents, API keys, tools — keep their own entries in the sidebar.
        </p>
      </div>
    </div>
  );
}
