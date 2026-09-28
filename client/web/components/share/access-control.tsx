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
import { Badge } from '@mantle/web-ui/ui/badge';
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
  alsoLoweredOf,
  closureAbove,
  closureBelow,
  embedsFollowIn,
  embedsSharedWith,
  isAccessLevel,
  queryKeysForType,
  showsLink,
  type AccessLoweredView,
} from '@/lib/access-levels';

/**
 * The owner's Access control for one item: who can see it, as one level
 * (Admin / Team / Client / Public). The level is the truth and the server
 * keeps the item's share link in step: none at admin or team (members read a
 * team item by level, signed in with their own logins), an open link at
 * client and public, which is the only time the link shows here. Replaces the
 * old ShareControl. There is no team link to make (member logins Phase 6
 * stage 6): setting an item to Team is how it reaches members.
 *
 * Embedding means sharing: lowering a page, drawing or note is the admin's
 * decision for the item AND what it embeds (images, files, drawings, child
 * pages), and the brain lowers them in the same write. So before the admin
 * confirms a lower level, the control says how many embedded items will be
 * shared too (the list on expand), and after it, what the brain lowered
 * (`alsoLowered`). An embed still above the item (one an admin raised on
 * purpose, or a kind that is admin only) is listed, never offered to lower.
 * A folder's contents do not follow it: those show as "still above" with
 * one explicit "Lower them too" (so do a page's embeds on a brain before
 * embeds followed, whose GET has no `embedsFollow`). The mirror:
 * raising an item (back to admin, or its link revoked elsewhere) leaves
 * what it holds below it, so those show too, with "Raise them too". Tasks,
 * events and the other admin-only kinds stay at admin; an old link on one
 * can be removed here.
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
  // What the brain lowered with the item on the last change (`alsoLowered`),
  // shown until the next pick or close.
  const [lastLowered, setLastLowered] = useState<{
    nodeId: string;
    items: AccessLoweredView[];
  } | null>(null);
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
        // A brain older than 0.232.257 has no /api/access route at all: say
        // what to do rather than a bare "not found" (audit MED 19).
        toast.error(
          e instanceof ApiError && e.status === 404
            ? 'Levels need brain v0.232.257 or later, or this item is gone. Update the brain in Settings > Updates.'
            : e instanceof Error
              ? e.message
              : 'Could not load who can see this',
        );
      }
    }
    if (current.current === id) setState({ nodeId: id, view: next });
  }, [nodeId, toast]);

  // Fresh on every open and on every item change while open. Closing drops
  // what was loaded, so the next open never flashes a stale level.
  useEffect(() => {
    setChoice(null);
    setCopied(false);
    setLastLowered(null);
    if (open) void load();
    else setState(null);
  }, [open, load]);

  const refreshScreens = (type: string) => {
    for (const queryKey of queryKeysForType(type)) void queryClient.invalidateQueries({ queryKey });
  };

  const setLevel = async (
    next: AccessLevel,
    closure: { withClosure?: boolean; raiseClosure?: boolean } = {},
  ) => {
    if (!view) return;
    const id = nodeId;
    setBusy(true);
    try {
      if (view.item.audience === 'admin' && next !== 'admin') await beforeEnable?.();
      const res = await apiSend<AccessNodeUpdate>(
        `/api/access/nodes/${encodeURIComponent(id)}`,
        'PATCH',
        { audience: next, ...closure },
      );
      // The lowered embeds live on their own screens (a page's files, a
      // folder's contents): refresh those too, not just this item's.
      // `raised` is absent from brains before 0.232.264.
      const changed = [...res.lowered, ...(res.raised ?? [])];
      refreshScreens(res.item.type);
      for (const type of new Set(changed.map((i) => i.type))) refreshScreens(type);
      if (current.current !== id) return;
      const also = alsoLoweredOf(res);
      setLastLowered(also && also.length > 0 ? { nodeId: id, items: also } : null);
      const lowered = new Map(changed.map((i) => [i.id, i]));
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
  const below: AccessItemView[] = view ? closureBelow(view.closure, level) : [];
  // The item's embeds follow it on this brain: nothing to offer, only to say.
  const follows = !!view && embedsFollowIn(view);
  const willShare: AccessItemView[] =
    view && choice ? embedsSharedWith(follows, view.closure, choice) : [];
  const shownLowered = lastLowered?.nodeId === nodeId ? lastLowered.items : [];

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
            {view.author ? (
              // A member wrote it and an admin accepted it (member logins
              // Phase 4): the author keeps read access at every level.
              <p className="text-xs text-muted-foreground">
                <Badge variant="secondary" className="mr-1.5 align-middle">
                  Member-authored
                </Badge>
                Written by {view.author.name}
                {view.author.acceptedAt
                  ? `, accepted ${new Date(view.author.acceptedAt).toLocaleDateString()}`
                  : ''}
                . They can always read it.
              </p>
            ) : null}
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
                  if (isAccessLevel(v)) {
                    setChoice(v === level ? null : v);
                    setLastLowered(null);
                  }
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
              {choice && willShare.length > 0 && (
                <ItemList
                  summary={`${willShare.length} embedded item${willShare.length === 1 ? '' : 's'} will be shared too`}
                  items={willShare.map((c) => ({
                    id: c.id,
                    title: c.title,
                    note: `${LEVEL_LABEL[c.audience]} to ${LEVEL_LABEL[choice]}`,
                  }))}
                />
              )}
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

            {shownLowered.length > 0 && (
              <div className="border-t border-border pt-3">
                <ItemList
                  summary={`${shownLowered.length} embedded item${shownLowered.length === 1 ? '' : 's'} shared too`}
                  items={shownLowered.map((l) => ({
                    id: l.id,
                    title: l.title,
                    note: `${LEVEL_LABEL[l.from]} to ${LEVEL_LABEL[l.to]}`,
                  }))}
                />
              </div>
            )}

            {above.length > 0 && follows && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {above.length} embedded item{above.length === 1 ? '' : 's'}{' '}
                  {above.length === 1 ? 'stays' : 'stay'} above {LEVEL_LABEL[level]} (raised on
                  purpose, or admin only), so people at this level and its link will not see{' '}
                  {above.length === 1 ? 'it' : 'them'}:
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
              </div>
            )}

            {above.length > 0 && !follows && (
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
                  onClick={() => void setLevel(level, { withClosure: true })}
                >
                  Lower {above.length === 1 ? 'it' : 'them'} too
                </Button>
              </div>
            )}

            {below.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {below.length} item{below.length === 1 ? '' : 's'} it{' '}
                  {view.item.type === 'branch' ? 'holds' : 'embeds'}{' '}
                  {below.length === 1 ? 'is' : 'are'} still open to more people than{' '}
                  {LEVEL_LABEL[level]}:
                </p>
                <ul className="scrollbar-thin scrollbar-hair max-h-28 space-y-0.5 overflow-y-auto text-xs">
                  {below.map((c) => (
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
                  onClick={() => void setLevel(level, { raiseClosure: true })}
                >
                  Raise {below.length === 1 ? 'it' : 'them'} too
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

/** A count that expands to its items (a native disclosure: keyboard and
 *  screen reader work without extra wiring). */
function ItemList({
  summary,
  items,
}: {
  summary: string;
  items: { id: string; title: string; note: string }[];
}) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">{summary}</summary>
      <ul className="scrollbar-thin scrollbar-hair mt-1 max-h-28 space-y-0.5 overflow-y-auto">
        {items.map((i) => (
          <li key={i.id} className="flex min-w-0 justify-between gap-2">
            <span className="min-w-0 truncate text-foreground">{i.title || 'Untitled'}</span>
            <span className="shrink-0">{i.note}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
