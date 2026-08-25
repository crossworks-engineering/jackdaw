'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Moon, Sun } from 'lucide-react';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Label } from '@mantle/web-ui/ui/label';
import { Skeleton } from '@mantle/web-ui/ui/skeleton';
import { Switch } from '@mantle/web-ui/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';

/**
 * How the brain's SHARED surfaces present themselves — the public /s reader
 * and the team workspace. Two settings, one section:
 *
 *  - the default light/dark mode a share link opens in (stamped server-side
 *    before first paint; visitors keep their own toggle on the page). Distinct
 *    from the sidebar's Mode card on purpose: that one is this browser's own
 *    view of the app (next-themes, localStorage), this one is what a stranger
 *    sees first;
 *  - the background switch: OFF keeps shared surfaces on the plain themed
 *    fill (the printable rendering) while the app keeps its gradient.
 *
 * Saves on change — a toggle with an explicit save button is a form
 * pretending to be a switch. Cache is patched in place, not invalidated: the
 * /api/appearance route carries a 30s public cache, and a refetch inside that
 * window would report the old value and make the change look lost.
 */

type AppearancePayload = {
  defaultMode?: string | null;
  shareNeat?: boolean;
};

type ShareMode = 'light' | 'dark' | 'system';

const MODES: ReadonlyArray<{ value: ShareMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function asShareMode(raw: string | null | undefined): ShareMode {
  return raw === 'dark' || raw === 'system' ? raw : 'light';
}

export function ShareModeControl() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const appearance = useQuery({
    queryKey: ['appearance'],
    queryFn: () => apiFetch<AppearancePayload>('/api/appearance'),
  });

  const apply = async (mode: ShareMode) => {
    setBusy(true);
    try {
      await apiSend('/api/profile/default-mode', 'PUT', { defaultMode: mode });
      queryClient.setQueryData<AppearancePayload>(['appearance'], (old) => ({
        ...(old ?? {}),
        defaultMode: mode,
      }));
      toast.success(
        'Share pages now open in ' +
          (mode === 'system' ? 'the visitor’s system mode.' : `${mode} mode.`),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the default mode.');
    } finally {
      setBusy(false);
    }
  };

  const applyNeat = async (on: boolean) => {
    setBusy(true);
    try {
      await apiSend('/api/profile/share-neat', 'PUT', { shareNeat: on });
      queryClient.setQueryData<AppearancePayload>(['appearance'], (old) => ({
        ...(old ?? {}),
        shareNeat: on,
      }));
      toast.success(
        on
          ? 'Shared surfaces show the background again.'
          : 'Shared surfaces now render on the plain surface, ready for printing.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the background switch.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Shared surfaces
        </h2>
        <p className="text-xs text-muted-foreground">
          How share links and the team workspace present themselves. The mode sets where a visitor
          starts; they keep their own light/dark toggle on the page. The Mode card in the sidebar
          stays yours and only changes this browser. Turning the background off keeps shared
          surfaces on the plain themed fill, the printable rendering, while the app keeps its
          gradient.
        </p>
      </div>

      {appearance.isSuccess ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={asShareMode(appearance.data.defaultMode)}
            disabled={busy}
            onValueChange={(mode) => {
              if (mode) void apply(mode as ShareMode);
            }}
            aria-label="Default mode for public share pages"
          >
            {MODES.map((m) => (
              <ToggleGroupItem key={m.value} value={m.value}>
                <m.icon />
                {m.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* The printable fallback: OFF keeps shared surfaces (share links
              and the team workspace) on the plain themed fill while the app
              keeps its gradient. */}
          <div className="flex items-center gap-2">
            <Switch
              id="share-neat"
              checked={appearance.data.shareNeat !== false}
              disabled={busy}
              onCheckedChange={(on) => void applyNeat(on)}
            />
            <Label htmlFor="share-neat" className="text-xs text-muted-foreground">
              Show the generated background on shared surfaces
            </Label>
          </div>
        </div>
      ) : (
        <Skeleton className="h-9 w-64 rounded-md" />
      )}
    </section>
  );
}
