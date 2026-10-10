'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2 } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { serverUrl } from '@mantle/web-ui/runtime-env';
import { copyText } from '@mantle/web-ui/lib/secure-context-fallbacks';
import { queryKeysForType } from '@/lib/access-levels';
import { openLinkReadsContactWrites } from '@/lib/contact-shares';
import {
  FOLDER_CONFIRM_NOTE,
  TOO_BIG_TEXT,
  appHolderLines,
  folderConfirmText,
  folderPreviewUrl,
  grantErrorText,
  grantUrl,
  grantsKey,
  grantsUrl,
  isNoGrants,
  LOST_SIGHT_TEXT,
  lostSight,
  skippedText,
  withConfirm,
  type FolderGrantPreview,
  type GrantChange,
  type GrantRow,
  type GrantsView,
} from '@/lib/grants';
import { invalidateLinkQueries, revokeShareLink } from '@/lib/shared-links';
import { useShellWorkspaces } from '@/components/workspaces/use-shell-workspaces';
import { AccessLinkBox } from './access-link-box';
import { ContactShareSection, OpenLinkDataWarning } from './contact-share-section';
import { GrantAccessView } from './grant-access-view';
import {
  GrantConfirmDialog,
  MoveGrantsDialog,
  type MoveTarget,
  type PendingGrantConfirm,
} from './grant-dialogs';
import { RevokeLinkDialog, type RevokeTarget } from './revoke-link-dialog';

/** The dialogs the panel asks for. They live beside the popover, never in
 *  it: a modal over an open popover would take its focus and close it. */
type Asks = {
  confirm: (p: PendingGrantConfirm) => void;
  move: (t: MoveTarget) => void;
  revoke: (t: RevokeTarget) => void;
};

function useGrantDialogs(beforeAsk?: () => void) {
  const [confirm, setConfirm] = useState<PendingGrantConfirm | null>(null);
  const [move, setMove] = useState<MoveTarget | null>(null);
  const [revoke, setRevoke] = useState<RevokeTarget | null>(null);
  const [revoking, setRevoking] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const asks: Asks = {
    confirm: (p) => {
      beforeAsk?.();
      setConfirm(p);
    },
    move: (t) => {
      beforeAsk?.();
      setMove(t);
    },
    revoke: (t) => {
      beforeAsk?.();
      setRevoke(t);
    },
  };
  const closeMove = useCallback(() => setMove(null), []);
  const dialogs = (
    <>
      <GrantConfirmDialog pending={confirm} onClose={() => setConfirm(null)} />
      <MoveGrantsDialog target={move} onClose={closeMove} />
      <RevokeLinkDialog
        target={revoke}
        busy={revoking}
        onCancel={() => setRevoke(null)}
        onConfirm={() => {
          if (!revoke) return;
          setRevoking(true);
          revokeShareLink(revoke.shareId)
            .then(() => {
              invalidateLinkQueries(qc);
              void qc.invalidateQueries({ queryKey: ['grants'] });
              toast.success(`Stopped the link on "${revoke.title || 'Untitled'}"`);
              setRevoke(null);
            })
            .catch((e) => {
              if (!(e instanceof ApiError && e.status === 401)) {
                toast.error(grantErrorText(e, 'Could not stop the link'));
              }
            })
            .finally(() => setRevoking(false));
        }}
      />
    </>
  );
  return { asks, dialogs };
}

/**
 * The Grant Access button (plan 7.1; replaces AccessControl): a popover with
 * the item's workspaces, "Add workspace", the open link and the contact
 * shares. Loads fresh on every open.
 */
export function GrantAccessControl({
  nodeId,
  type,
  iconOnly = false,
  beforeEnable,
  hint,
}: {
  nodeId: string;
  /** The item's kind ('app' words the Write switch for its data). */
  type?: string;
  iconOnly?: boolean;
  /** Run before the item first reaches another workspace or a link: a page
   *  or drawing commits its draft so what others read is what is on screen. */
  beforeEnable?: () => Promise<void> | void;
  /** Kind-specific consequence, shown under the panel. */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const { asks, dialogs } = useGrantDialogs(() => setOpen(false));
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* `icon-sm`, not `icon`: this sits in detail headers next to
            `size="sm"` buttons. */}
          <Button
            variant="outline"
            size={iconOnly ? 'icon-sm' : 'sm'}
            aria-label="Access"
            title={iconOnly ? 'Access: who can see this' : undefined}
          >
            <Share2 />
            {!iconOnly && 'Access'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96">
          {open && (
            <GrantAccessPanel
              nodeId={nodeId}
              type={type}
              beforeEnable={beforeEnable}
              hint={hint}
              asks={asks}
            />
          )}
        </PopoverContent>
      </Popover>
      {dialogs}
    </>
  );
}

/** The same panel in a dialog: a folder's Access in the tree. */
export function GrantAccessDialog({
  nodeId,
  title,
  type = 'branch',
  onOpenChange,
}: {
  /** The folder (null = closed). */
  nodeId: string | null;
  title: string;
  type?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { asks, dialogs } = useGrantDialogs();
  return (
    <>
      <Dialog open={nodeId !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Access: {title || 'Untitled'}</DialogTitle>
            <DialogDescription>{FOLDER_CONFIRM_NOTE}</DialogDescription>
          </DialogHeader>
          {nodeId && <GrantAccessPanel nodeId={nodeId} type={type} asks={asks} />}
        </DialogContent>
      </Dialog>
      {dialogs}
    </>
  );
}

function GrantAccessPanel({
  nodeId,
  type: givenType,
  beforeEnable,
  hint,
  asks,
}: {
  nodeId: string;
  type?: string;
  beforeEnable?: () => Promise<void> | void;
  hint?: string;
  asks: Asks;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const shell = useShellWorkspaces();
  const adminWsId = shell?.workspaces.find((w) => w.isAdmin)?.id ?? null;
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: grantsKey(nodeId),
    queryFn: () => apiFetch<GrantsView>(grantsUrl(nodeId), { cache: 'no-store' }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const view = q.data;
  const type = givenType ?? view?.item?.type;
  const folder = type === 'branch';
  const title = view?.item?.title ?? '';
  // The item on screen now: a write that lands after a switch refreshes
  // both, but never shows an error for an item no longer shown.
  const current = useRef(nodeId);
  current.current = nodeId;

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: grantsKey(nodeId) });
    for (const queryKey of queryKeysForType(type ?? '')) void qc.invalidateQueries({ queryKey });
    void qc.invalidateQueries({ queryKey: ['tree'] });
  }, [qc, nodeId, type]);

  /** One write: busy while it runs, the brain's words on a refusal. */
  const write = async (run: () => Promise<unknown>, failure: string) => {
    const id = nodeId;
    setBusy(true);
    try {
      const res = await run();
      if (lostSight(res)) {
        toast.success(LOST_SIGHT_TEXT);
      } else {
        const skipped = skippedText(
          (res as { skipped?: unknown[] } | undefined)?.skipped?.length ?? 0,
        );
        if (skipped) toast.error(skipped);
      }
    } catch (e) {
      if (current.current === id && !(e instanceof ApiError && e.status === 401)) {
        toast.error(grantErrorText(e, failure));
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  /** A folder change waits for its confirm: how many items gain or lose. */
  const askFolder = async (change: GrantChange, verb: string, run: () => Promise<unknown>) => {
    let preview: FolderGrantPreview | null = null;
    try {
      preview = await apiFetch<FolderGrantPreview>(folderPreviewUrl(nodeId, change), {
        cache: 'no-store',
      });
    } catch (e) {
      if (!isNoGrants(e)) {
        toast.error(grantErrorText(e, 'Could not count the items in this folder'));
        return;
      }
    }
    asks.confirm({
      title: change.add
        ? `Share this folder with ${change.name}?`
        : `Remove ${change.name} from this folder?`,
      lines: preview
        ? preview.tooBig
          ? [TOO_BIG_TEXT]
          : [folderConfirmText(change, preview)]
        : ['Items in it take this change.'],
      note: FOLDER_CONFIRM_NOTE,
      verb,
      blocked: preview?.tooBig === true,
      run: () => write(run, 'Could not change the folder'),
    });
  };

  const holders = (view?.rows ?? []).filter((r) => !r.excluded).map((r) => r.name);

  const onAdd = async (ws: { wsId: string; name: string }) => {
    const post = (confirm: boolean) =>
      apiSend(grantsUrl(nodeId), 'POST', { wsId: ws.wsId, ...(confirm ? { confirm: true } : {}) });
    if (folder) {
      await askFolder({ add: ws.wsId, name: ws.name }, 'Share', () => post(true));
      return;
    }
    if (type === 'app') {
      // 21.8 row 13: a new holder sees the app's data AND narrows what the
      // app reads. Both, always, before the write.
      let counts: FolderGrantPreview['app'];
      try {
        counts = (
          await apiFetch<FolderGrantPreview>(folderPreviewUrl(nodeId, { add: ws.wsId, name: '' }), {
            cache: 'no-store',
          })
        ).app;
      } catch {
        counts = undefined;
      }
      asks.confirm({
        title: `Share this app with ${ws.name}?`,
        lines: appHolderLines(ws.name, holders, counts),
        verb: 'Share',
        run: () =>
          write(async () => {
            await beforeEnable?.();
            return post(true);
          }, 'Could not share it'),
      });
      return;
    }
    await write(async () => {
      await beforeEnable?.();
      return post(false);
    }, 'Could not share it');
  };

  const onRemove = (row: GrantRow) => {
    const del = (confirm: boolean) =>
      apiSend(withConfirm(grantUrl(nodeId, row.wsId), confirm), 'DELETE');
    if (folder) {
      void askFolder({ remove: row.wsId, name: row.name }, 'Remove', () => del(true));
      return;
    }
    void write(() => del(false), 'Could not remove it');
  };

  const onWrite = (row: GrantRow, on: boolean) =>
    void write(
      () =>
        apiSend(grantUrl(nodeId, row.wsId), 'PATCH', {
          write: on,
          ...(folder ? { confirm: true } : {}),
        }),
      'Could not change it',
    );

  const onRestore = (row: GrantRow) =>
    void write(
      () => apiSend(withConfirm(`${grantUrl(nodeId, row.wsId)}/restore`, folder), 'POST'),
      'Could not restore it',
    );

  const onHand = (row: GrantRow) =>
    void write(
      () => apiSend(withConfirm(`${grantUrl(nodeId, row.wsId)}/hand`, folder), 'POST'),
      'Could not change it here',
    );

  const onGrantEmbeds = () =>
    void write(
      () =>
        apiSend(`${grantsUrl(nodeId)}/embeds`, 'POST', {
          wsIds: (view?.rows ?? []).filter((r) => !r.excluded).map((r) => r.wsId),
        }),
      'Could not share what it embeds',
    );

  const onMcpAccess = (on: boolean) =>
    void write(async () => {
      await apiSend(`/api/apps/${encodeURIComponent(nodeId)}`, 'PATCH', { mcpAccess: on });
      void qc.invalidateQueries({ queryKey: ['apps'] });
      return undefined;
    }, 'Could not change MCP access');

  const onMove = (ws: { wsId: string; name: string }) =>
    asks.move({
      nodeIds: [nodeId],
      action: `Move “${title || 'this item'}” to ${ws.name}.`,
      to: { toWorkspaceId: ws.wsId },
      oldHome: view?.home.name ? { wsId: view.home.wsId, name: view.home.name } : undefined,
      onMoved: refresh,
    });

  if (!view) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {q.isError ? (
          isNoGrants(q.error) ? (
            'Workspaces need a newer brain. Update the brain in Settings > Updates.'
          ) : (
            grantErrorText(q.error, 'Could not load who can see this.')
          )
        ) : (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden /> Loading…
          </>
        )}
      </p>
    );
  }

  return (
    <GrantAccessView
      view={view}
      busy={busy}
      adminWsId={adminWsId}
      type={type}
      hint={hint}
      onWrite={onWrite}
      onRemove={onRemove}
      onRestore={onRestore}
      onHand={onHand}
      onAdd={(ws) => void onAdd(ws)}
      onMove={onMove}
      onGrantEmbeds={onGrantEmbeds}
      onMcpAccess={onMcpAccess}
      link={
        <OpenLinkPart
          nodeId={nodeId}
          view={view}
          type={type}
          title={title}
          beforeEnable={beforeEnable}
          onChanged={refresh}
          onRevoke={asks.revoke}
        />
      }
    />
  );
}

/**
 * The open link and the contact shares (plan 8.1 and 8.2, kept under the
 * panel). A link is a per-item open door for people with no login; it is not
 * a workspace. Shown only when the brain sends the item's link (contract ask
 * 1): a brain that does not shows the workspaces alone.
 */
function OpenLinkPart({
  nodeId,
  view,
  type,
  title,
  beforeEnable,
  onChanged,
  onRevoke,
}: {
  nodeId: string;
  view: GrantsView;
  type: string | undefined;
  title: string;
  beforeEnable?: () => Promise<void> | void;
  onChanged: () => void;
  onRevoke: (t: RevokeTarget) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (view.link === undefined) return null;
  const link = view.link;
  const mayLink = view.mayLink === true;
  const url = link ? serverUrl(link.path) : '';
  const shares = view.contactShares ?? null;
  const warn =
    !link &&
    !!shares &&
    openLinkReadsContactWrites({ itemType: type ?? '', openLink: true, shares });

  const make = async () => {
    setBusy(true);
    try {
      await beforeEnable?.();
      await apiSend('/api/shares', 'POST', { nodeId });
      invalidateLinkQueries(qc);
      onChanged();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(grantErrorText(e, 'Could not make the link'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (!link && !mayLink && !view.hasLink && !shares?.length) return null;

  return (
    <>
      <AccessLinkBox
        url={link ? url : null}
        hasLink={!!link || view.hasLink === true}
        mayLink={mayLink}
        copied={copied}
        busy={busy}
        warning={warn ? <OpenLinkDataWarning /> : null}
        onCopy={() =>
          void copyText(url).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => toast.error('Copy failed'),
          )
        }
        onMake={() => void make()}
        onStop={() => link && onRevoke({ shareId: link.id, title, cascade: false, stays: null })}
      />
      {shares && mayLink && type !== 'branch' && (
        <ContactShareSection
          nodeId={nodeId}
          itemType={type ?? ''}
          shares={shares}
          openLink={!!link}
          onChanged={() => {
            onChanged();
            invalidateLinkQueries(qc);
          }}
          onRemove={(s) =>
            onRevoke({
              shareId: s.shareId,
              title,
              cascade: false,
              stays: `Only ${s.name || 'this contact'} loses it. The workspaces do not change.`,
            })
          }
        />
      )}
    </>
  );
}
