'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';
import type {
  AccessItemView,
  AccessLevel,
  AccessNodeUpdate,
  AccessNodeView,
} from '@mantle/client-types';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import { Switch } from '@mantle/web-ui/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { serverUrl } from '@mantle/web-ui/runtime-env';
import {
  LEVEL_LABEL,
  LEVEL_MEANING,
  LEVEL_ORDER,
  closureAbove,
  isAccessLevel,
  queryKeysForType,
  showsLink,
} from '@/lib/access-levels';

/**
 * The owner's Access control for one item: who can see it, as one level
 * (Admin / Team / Client / Public). The level is the truth and the server
 * keeps the item's share link in step: none at admin, a team-only link at
 * team (members open it from the team workspace), an open link at client and
 * public, which is the only time the link shows here. Replaces the old
 * ShareControl and its "Team members only" switch.
 *
 * Lowering an item does not lower what it embeds (a page's files and
 * drawings, a folder's contents). Those show as "still above" with one
 * explicit "Lower them too". Tasks, events and the other admin-only kinds
 * stay at admin; an old link on one can be removed here.
 *
 * Picking a level does not change it. The level is a server write that can
 * create an open link, so the arrow keys (which move the selection in a kit
 * ToggleGroup) only pick; the change happens on the explicit Apply.
 *
 * API: GET/PATCH /api/access/nodes/:id (plus /api/shares/cascade for pages'
 * sub-pages). Loads fresh on every open, and again when the host reuses this
 * control for another item (list screens keep it mounted across selection);
 * a response for an item that is no longer shown is dropped.
 */
export function AccessControl({
  nodeId,
  iconOnly = false,
  beforeEnable,
  hint,
}: {
  nodeId: string;
  iconOnly?: boolean;
  /** Run before the item first leaves admin (it gains a link): a page or
   *  drawing commits its draft so what members and link holders see is what
   *  the owner sees now. */
  beforeEnable?: () => Promise<void> | void;
  /** Kind-specific consequence, shown under the control. */
  hint?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Every piece of loaded state carries the item it belongs to, so a host that
  // swaps `nodeId` under a mounted control can never show (or copy the link
  // of) the previous item: a view for another id reads as "not loaded".
  const [state, setState] = useState<{ nodeId: string; view: AccessNodeView | null } | null>(null);
  const view = state?.nodeId === nodeId ? state.view : null;
  const loaded = state?.nodeId === nodeId;
  // The level the owner has picked but not applied yet (null = none).
  const [choice, setChoice] = useState<AccessLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // The item on screen now; async work checks it before writing state.
  const current = useRef(nodeId);
  current.current = nodeId;

  const load = useCallback(async () => {
    const id = nodeId;
    let next: AccessNodeView | null = null;
    try {
      next = await apiFetch<AccessNodeView>(`/api/access/nodes/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
    } catch (e) {
      if (current.current === id && !(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error ? e.message : 'Could not load who can see this');
      }
    }
    if (current.current === id) setState({ nodeId: id, view: next });
  }, [nodeId, toast]);

  // Fresh on every open and on every item change while open. Closing drops
  // what was loaded, so the next open never flashes a stale level.
  useEffect(() => {
    setChoice(null);
    setCopied(false);
    if (open) void load();
    else setState(null);
  }, [open, load]);

  const refreshScreens = (type: string) => {
    for (const queryKey of queryKeysForType(type)) void queryClient.invalidateQueries({ queryKey });
  };

  const setLevel = async (next: AccessLevel, withClosure = false) => {
    if (!view) return;
    const id = nodeId;
    setBusy(true);
    try {
      if (view.item.audience === 'admin' && next !== 'admin') await beforeEnable?.();
      const res = await apiSend<AccessNodeUpdate>(
        `/api/access/nodes/${encodeURIComponent(id)}`,
        'PATCH',
        { audience: next, withClosure },
      );
      // The lowered embeds live on their own screens (a page's files, a
      // folder's contents): refresh those too, not just this item's.
      refreshScreens(res.item.type);
      for (const type of new Set(res.lowered.map((i) => i.type))) refreshScreens(type);
      if (current.current !== id) return;
      const lowered = new Map(res.lowered.map((i) => [i.id, i]));
      setState({
        nodeId: id,
        view: {
          ...view,
          item: res.item,
          share: res.share,
          closure: view.closure.map((c) => lowered.get(c.id) ?? c),
        },
      });
      setChoice(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not change who can see this');
    } finally {
      setBusy(false);
    }
  };

  const setCascade = async (on: boolean) => {
    if (!view?.share) return;
    setBusy(true);
    try {
      const id = nodeId;
      const d = await apiSend<{ count?: number }>('/api/shares/cascade', 'POST', {
        nodeId: id,
        on,
      });
      if (current.current === id) {
        setState({ nodeId: id, view: { ...view, share: { ...view.share, cascade: on } } });
      }
      const n = d.count ?? view.childCount;
      toast.success(
        on ? `${n} sub-page${n === 1 ? '' : 's'} now match this page` : 'Sub-pages back to admin',
      );
      refreshScreens('page');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not change the sub-pages');
    } finally {
      setBusy(false);
    }
  };

  const absoluteUrl = view?.share ? serverUrl(view.share.path) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const level = view?.item.audience ?? 'admin';
  const picked = choice ?? level;
  const above: AccessItemView[] = view ? closureAbove(view.closure, level) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* `icon-sm`, not `icon`: this sits in detail headers next to
            `size="sm"` buttons, and `icon` is 40px against their 36px. */}
        <Button variant="outline" size={iconOnly ? 'icon-sm' : 'sm'} aria-label="Access">
          <Share2 />
          {!iconOnly && 'Access'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {!view ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {loaded ? (
              'Could not load who can see this.'
            ) : (
              <>
                <Loader2 className="size-3 animate-spin" aria-hidden /> Loading…
              </>
            )}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">Who can see this</p>
              <ToggleGroup
                type="single"
                variant="outline"
                size="default"
                className="w-full"
                loop={false}
                value={picked}
                disabled={busy || !view.canLower}
                onValueChange={(v) => {
                  // Empty = a press on the picked item: keep the pick.
                  if (isAccessLevel(v)) setChoice(v === level ? null : v);
                }}
              >
                {LEVEL_ORDER.map((l) => (
                  <ToggleGroupItem key={l} value={l} className="flex-1" aria-label={LEVEL_LABEL[l]}>
                    {LEVEL_LABEL[l]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {view.canLower
                  ? LEVEL_MEANING[picked]
                  : 'Admin only. Only pages, notes, drawings, tables, files, folders, apps and formulas can be shared.'}
              </p>
              {choice && (
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChoice(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void setLevel(choice)}>
                    {busy && <Loader2 className="animate-spin" aria-hidden />}
                    {showsLink(choice) && !showsLink(level)
                      ? `Make ${LEVEL_LABEL[choice]} (open link)`
                      : `Set to ${LEVEL_LABEL[choice]}`}
                  </Button>
                </div>
              )}
            </div>

            {view.canLower && showsLink(level) && (
              <div className="border-t border-border pt-3">
                {view.share ? (
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={absoluteUrl}
                      className="h-8 text-xs"
                      aria-label="Link"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button size="icon-xs" variant="outline" onClick={copy} aria-label="Copy link">
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">This item has no link.</p>
                )}
              </div>
            )}

            {view.item.type === 'page' &&
              view.share &&
              level !== 'admin' &&
              view.childCount > 0 && (
                <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Include sub-pages</p>
                    <p className="text-xs text-muted-foreground">
                      The {view.childCount} page{view.childCount === 1 ? '' : 's'} nested under this
                      one take its level. Off puts them back to admin.
                    </p>
                  </div>
                  <Switch
                    checked={view.share.cascade}
                    disabled={busy}
                    onCheckedChange={(v) => void setCascade(v)}
                    aria-label="Include sub-pages"
                  />
                </div>
              )}

            {above.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {above.length} item{above.length === 1 ? '' : 's'} it{' '}
                  {view.item.type === 'branch' ? 'holds' : 'embeds'}{' '}
                  {above.length === 1 ? 'stays' : 'stay'} above {LEVEL_LABEL[level]}, so people at
                  this level will not see {above.length === 1 ? 'it' : 'them'}:
                </p>
                <ul className="scrollbar-thin scrollbar-hair max-h-28 space-y-0.5 overflow-y-auto text-xs">
                  {above.map((c) => (
                    <li key={c.id} className="flex min-w-0 justify-between gap-2">
                      <span className="min-w-0 truncate">{c.title || 'Untitled'}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {LEVEL_LABEL[c.audience]}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setLevel(level, true)}
                >
                  Lower {above.length === 1 ? 'it' : 'them'} too
                </Button>
              </div>
            )}

            {!view.canLower && view.share && (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">An older link still exists.</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setLevel('admin')}
                >
                  Remove link
                </Button>
              </div>
            )}

            {hint && view.canLower && (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">{hint}</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
