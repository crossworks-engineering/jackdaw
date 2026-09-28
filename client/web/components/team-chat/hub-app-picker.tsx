'use client';

/**
 * Owner control on the Team admin Settings tab: which mini-app (if any) a
 * member login sees as their home (PUT/DELETE /api/team-admin/hub-app; the
 * route keeps its name from the retired team-code /hub, its first reader).
 * Designating requires a published build (enforced server-side); clearing
 * reverts members to the built-in home. The share lifecycle note:
 * designation ensures a TEAM-mode share for the app — undesignating leaves
 * that share alone (revoke it from the app's own share controls if wanted).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutTemplate } from 'lucide-react';
import { Label } from '@mantle/web-ui/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiSend } from '@mantle/web-ui/api-fetch';

const BUILT_IN = '__built_in__';

export function HubAppPicker({
  currentAppId,
  apps,
}: {
  /** The designated app id, or null for the built-in hub. */
  currentAppId: string | null;
  /** The owner's PUBLISHED apps (id + title), designation candidates. */
  apps: { id: string; title: string }[];
}) {
  const [value, setValue] = useState(currentAppId ?? BUILT_IN);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const apply = async (next: string) => {
    const prev = value;
    setValue(next); // optimistic
    setPending(true);
    try {
      if (next === BUILT_IN) {
        await apiSend('/api/team-admin/hub-app', 'DELETE');
        toast.success('Members now see the built-in home.');
      } else {
        const res = await apiSend<{ modeChanged: boolean }>('/api/team-admin/hub-app', 'PUT', {
          appId: next,
        });
        toast.success(
          res.modeChanged
            ? 'Home app set. It is now at Team level, and its share link is team-members-only.'
            : 'Home app set. Members see it as their home.',
        );
      }
      router.refresh();
    } catch (err) {
      setValue(prev); // revert
      toast.error(err instanceof Error ? err.message : 'Could not update the home app.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="hubApp" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LayoutTemplate className="size-3.5" aria-hidden />
        Home app
      </Label>
      <Select value={value} onValueChange={(v) => void apply(v)} disabled={pending}>
        <SelectTrigger id="hubApp" size="xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BUILT_IN}>Built-in home</SelectItem>
          {apps.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] leading-snug text-muted-foreground">
        A published app shown as the members&rsquo; home. Choosing one sets it to Team level, so
        every member can run it. Falls back to the built-in home if the app breaks.
      </p>
    </div>
  );
}
