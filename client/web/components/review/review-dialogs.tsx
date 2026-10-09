'use client';

/**
 * The review actions (member logins Phase 4), in the header of the item's
 * own workspace pane since Team admin > Review went (workspace review
 * pattern, 2026-10-09): Approve into the brain (the admin picks the level,
 * and for a page or files where they land), Reject (back to its author, no
 * note), Take over, and Discard for an item a deactivated login left behind.
 * The accept dialog also serves an admin's own private items (Phase 7).
 *
 * Every action takes two callbacks: `onDone(opened?)` once the item left the
 * queue (`opened`: the brain item it became, after an Approve), and
 * `onChanged()` after a refusal, so the queue is read again.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Hand, Handshake, Loader2, Trash2, Undo2, Users } from 'lucide-react';
import type { AccessItemView, AccessLevel } from '@mantle/client-types';
import type { ReviewAuthorRole } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Label } from '@mantle/web-ui/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@mantle/web-ui/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@mantle/web-ui/ui/alert-dialog';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  LEVEL_LABEL,
  LEVEL_MEANING,
  LEVEL_ORDER,
  effectiveOf,
  isAccessLevel,
  offeredUnder,
} from '@/lib/access-levels';
import { privateViewHref } from '@/lib/admin-private';
import {
  acceptVisibilityRefusal,
  acceptedLine,
  authorRoleLabel,
  bundleSummary,
  confirmLevelRefusal,
  defaultAcceptLevel,
  goingDownAt,
  goingDownLine,
  levelConfirmation,
  memberReview,
  needsLevelConfirm,
  placeIsFor,
  placeShareLine,
  reviewErrorMessage,
  takeOverErrorMessage,
  type AcceptInput,
  type AcceptPlace,
  type AcceptResult,
  type Bundle,
  type ReviewItemRow,
} from '@/lib/member-review';
import type { SpaceKind } from '@/lib/member-space';
import { rejectConfirm } from '@/lib/workspace-review';
import { FolderPickerDialog } from '@/components/item-tree/folder-picker';
import { readerTreeAdapter } from '@/components/item-tree/kinds/reader';
import {
  VisibilityConfirmDialog,
  type PendingConfirm,
} from '@/components/item-tree/visibility-confirm';
import { TREE_KIND_SPECS, type TreeFolder } from '@mantle/web-ui/types/tree';

type FolderRow = { path: string; title: string; slug: string };

/** What a review action does once it is through, or refused. */
type ReviewActionProps = {
  row: ReviewItemRow;
  /** The item left the queue; `opened` is the brain item it became. */
  onDone: (opened?: string) => void;
  /** Refused (handled elsewhere, recalled): read the queue again. */
  onChanged: () => void;
};

export function AcceptDialog({ row, onDone, onChanged }: ReviewActionProps) {
  return (
    <AcceptIntoBrainDialog
      item={row}
      triggerLabel="Approve"
      authorRole={row.author.role}
      description={
        <>
          “{row.title || 'Untitled'}” moves out of {row.author.name}&rsquo;s space and becomes a
          brain item you can edit. Links to it keep working.
        </>
      }
      bundle={{
        key: ['team-admin', 'submissions', row.id, 'bundle'],
        load: (pick) => memberReview.bundle(row.id, pick),
      }}
      // Pinned: what is approved is the version on screen (`row` is the one
      // this pane shows), never one sent again since.
      accept={(input) => memberReview.accept(row.id, { ...input, submittedAt: row.submittedAt })}
      onAccepted={(res) => onDone(res.id)}
      onFailed={onChanged}
      errorMessage={reviewErrorMessage}
    />
  );
}

/** What an accept moves: its id, kind and title. */
export type AcceptTarget = { id: string; type: SpaceKind; title: string };

/**
 * Accept into the brain: the admin picks who can see it, and for a page or
 * files where they land. A member's submission (AcceptDialog) and an admin's
 * own private item (member logins Phase 7) both come through here; only the
 * route differs. `bundle` lists what moves along when the route can say so;
 * without it only a file item asks for a folder.
 *
 * A client's item (audit A28): the dialog says who wrote it, starts at Team,
 * and at Client or Public lists what goes down with it (the embed closure
 * above that level, from the bundle), one tick each; Accept waits for all of
 * them and sends `lowerConfirmed` with the ticked ids. The brain's own 409
 * `confirm-level` (a brain that knew more, or the admin's own accept after a
 * Take over) shows its list the same way. A member's item is unchanged.
 *
 * A shared folder (folder plan phase 5): where it lands says so, and the
 * level picker offers nothing above that folder's share (it is read at the
 * share there whatever is chosen, as the Access control says). A pick of
 * another folder asks the brain again for that place. When the item or its
 * bundle would still be read above the chosen level where it lands, the
 * brain refuses (409 `visibility`) with the list; the admin sees it and
 * repeats with `visibilityConfirmed`.
 */
export function AcceptIntoBrainDialog({
  item,
  description,
  bundle: bundleSource,
  accept: send,
  beforeAccept,
  onAccepted,
  onFailed,
  errorMessage,
  triggerLabel = 'Accept',
  authorRole,
}: {
  item: AcceptTarget;
  /** Who wrote it, where the brain says (absent from older brains). */
  authorRole?: ReviewAuthorRole | null;
  description: ReactNode;
  /** `load(pick)`: the preview, with the place worked out for the admin's
   *  pick (undefined = where it was filed, null = the top level). */
  bundle?: { key: readonly unknown[]; load: (pick?: string | null) => Promise<Bundle> };
  accept: (input: AcceptInput) => Promise<AcceptResult>;
  /** Runs first (an editor saving what was typed); false stops the accept. */
  beforeAccept?: () => Promise<boolean>;
  onAccepted: (res: AcceptResult, input: AcceptInput) => void;
  onFailed?: () => void;
  errorMessage: (err: unknown, fallback: string) => string;
  triggerLabel?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<AccessLevel>(() => defaultAcceptLevel(authorRole));
  // What the admin ticked of what goes down, and the brain's own ask when it
  // refused the level (409 confirm-level); both start over on a new level.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<{
    level: AccessLevel;
    message: string;
    goingDown: AccessItemView[] | null;
  } | null>(null);
  const [folder, setFolder] = useState('files');
  // Where the item lands (folder plan phase 5): undefined = where the author
  // filed it (the brain's default), else the folder the admin picked (null =
  // the top level).
  const [pick, setPick] = useState<Pick<TreeFolder, 'id' | 'name'> | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  // The brain's 409 `visibility`: what would be read above the chosen level.
  const [exposed, setExposed] = useState<PendingConfirm | null>(null);
  // What the admin said yes to (the level and the place it was for), so a
  // later ask on the same accept (a client's ticks) does not ask it again.
  const [exposedOk, setExposedOk] = useState<string | null>(null);
  // That yes holds for this opening of the dialog only.
  useEffect(() => {
    if (!open) {
      setExposedOk(null);
      setExposed(null);
    }
  }, [open]);

  const bundle = useQuery({
    queryKey: [...(bundleSource?.key ?? ['accept-bundle', 'none']), 'filed'],
    queryFn: () => bundleSource!.load(),
    enabled: open && !!bundleSource,
  });
  // A brain with the tree says where it lands (pages too, since folder
  // phase 7); it files every item of the bundle in place, so no separate
  // Files folder is asked for.
  const filed = bundle.data?.place;
  // The admin's pick, asked for again: its crumbs, the folders made below
  // it, and the share it is read at there.
  const picked = useQuery({
    queryKey: [
      ...(bundleSource?.key ?? ['accept-bundle', 'none']),
      'pick',
      pick === undefined ? null : (pick?.id ?? 'root'),
    ],
    queryFn: () => bundleSource!.load(pick?.id ?? null),
    enabled: open && !!bundleSource && !!filed && pick !== undefined,
  });
  const pickPlace = picked.data?.place;
  const place: AcceptPlace | undefined =
    pick === undefined ? filed : pickPlace && placeIsFor(pickPlace, pick) ? pickPlace : undefined;
  // Still asking where the pick lands: its share is not known yet.
  const placing = pick !== undefined && !!filed && picked.isPending;
  // The pick's preview failed: its share is unknown, so Accept waits for a
  // retry (the brain would still ask, but the dialog would say nothing).
  const pickFailed = pick !== undefined && !!filed && picked.isError;
  const placeAdapter = filed ? readerTreeAdapter(filed.kind) : null;
  // What it is read at there, at least (null: no shared folder, or a brain
  // that does not say). DISPLAY only: the level sent is the one chosen, so
  // the item's own level stays the admin's and moving it out of the folder
  // later drops the folder's share. The brain asks (409 `visibility`) and
  // tells (`readAt`) about the folder.
  const share = place?.share ?? null;
  const level = effectiveOf(chosen, share);
  const hasFiles =
    !filed &&
    (bundleSource
      ? (bundle.data?.items.some((i) => i.type === 'file') ?? false)
      : item.type === 'file');
  const folders = useQuery({
    queryKey: ['files', 'tree'],
    queryFn: () => apiFetch<{ folders: FolderRow[] }>('/api/files/folders?tree=true'),
    enabled: open && hasFiles,
  });

  // What goes down with it at this level, when it needs the admin's ticks.
  const asked = refusal?.level === level ? refusal : null;
  const confirming = !!asked || needsLevelConfirm(authorRole, level);
  const goingDown: AccessItemView[] = asked
    ? (asked.goingDown ?? [])
    : confirming
      ? goingDownAt(bundle.data?.closure, level)
      : [];
  // A brain that sends no list (before the audit fix), in its 409 or in the
  // bundle: one tick, for the level and all it embeds.
  const levelOnly = asked
    ? asked.goingDown === null
    : confirming && !!bundle.data && bundle.data.closure === undefined;
  const confirmation = confirming
    ? levelOnly
      ? ticked.has(LEVEL_TICK)
        ? { lowerConfirmed: true }
        : null
      : levelConfirmation(goingDown, ticked)
    : undefined;
  const pickLevel = (v: AccessLevel) => {
    setChosen(v);
    setTicked(new Set());
  };
  const tick = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const acceptFor = `${chosen}|${pick === undefined ? 'filed' : (pick?.id ?? 'root')}`;
  const accept = async (visibilityConfirmed = exposedOk === acceptFor) => {
    setBusy(true);
    try {
      if (beforeAccept && !(await beforeAccept())) return;
      const input: AcceptInput = {
        audience: chosen,
        folderPath: hasFiles ? folder : null,
        ...(filed && pick !== undefined ? { folderId: pick?.id ?? null } : {}),
        ...(confirmation ?? {}),
        ...(visibilityConfirmed ? { visibilityConfirmed: true } : {}),
      };
      const res = await send(input);
      toast.success(acceptedLine(item.title, res));
      if (res.levelWarning) toast.error(`Level set, link not made: ${res.levelWarning}`);
      setOpen(false);
      onAccepted(res, input);
    } catch (err) {
      const ask = confirmLevelRefusal(err);
      if (ask) {
        // Not a failure: the brain wants the admin to see what goes down.
        setRefusal({ level, ...ask });
        setTicked(new Set());
        return;
      }
      const refusal = acceptVisibilityRefusal(err);
      if (refusal) {
        // Not a failure either: it lands in a shared folder, read above the
        // chosen level there. Nothing moved; the admin sees what and says so.
        setExposed({
          refusal,
          action: `Accept “${item.title || 'Untitled'}” at ${LEVEL_LABEL[level]}.`,
          note: 'Where they land, a shared folder opens them above that: they are read at its share.',
          verb: 'Accept',
          run: () => {
            setExposedOk(acceptFor);
            void accept(true);
          },
        });
        return;
      }
      toast.error(errorMessage(err, 'Could not accept this item.'));
      onFailed?.();
    } finally {
      setBusy(false);
    }
  };

  const folderRows = [
    { path: 'files', label: 'Files (top level)' },
    ...(folders.data?.folders ?? [])
      .filter((f) => f.path !== 'files')
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({
        path: f.path,
        label: `${'  '.repeat(f.path.split('.').length - 2)}${f.title || f.slug}`,
      })),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept into the brain</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {authorRoleLabel(authorRole) ? (
            <p className="text-xs text-muted-foreground">
              <Badge variant="secondary" className="mr-1.5 align-middle">
                {authorRoleLabel(authorRole)}
              </Badge>
              {authorRole === 'client'
                ? 'A client wrote this. It starts at Team.'
                : 'A member wrote this.'}
            </p>
          ) : null}
          <div className="space-y-2">
            {/* A label for a group of buttons names it through aria-labelledby
                (htmlFor reaches only one form control). */}
            <Label id="review-level-label">Who can see it</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="review-level-label"
              className="w-full"
              loop={false}
              value={level}
              disabled={busy}
              onValueChange={(v) => {
                if (isAccessLevel(v)) pickLevel(v);
              }}
            >
              {LEVEL_ORDER.map((l) => (
                <ToggleGroupItem
                  key={l}
                  value={l}
                  className="flex-1"
                  aria-label={LEVEL_LABEL[l]}
                  // Nothing above the share of the folder it lands in: it is
                  // read at that share there whatever is chosen.
                  disabled={!offeredUnder(l, share)}
                >
                  {LEVEL_LABEL[l]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">{LEVEL_MEANING[level]}</p>
          </div>

          {confirming ? (
            <GoingDownList
              line={
                asked ? asked.message : goingDownLine(level, levelOnly ? null : goingDown.length)
              }
              items={levelOnly ? [] : goingDown}
              levelTick={levelOnly ? `Accept it at ${LEVEL_LABEL[level]}` : null}
              waiting={!asked && !!bundleSource && !bundle.data}
              ticked={ticked}
              disabled={busy}
              onTick={tick}
            />
          ) : null}

          {filed && placeAdapter ? (
            <div className="space-y-2">
              <Label>Where it goes</Label>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {placeLine(place ?? filed, place ? undefined : pick)}
                    {(place ?? filed).creates.length ? (
                      <span className="text-muted-foreground">
                        {' '}
                        / {(place ?? filed).creates.join(' / ')} (new)
                      </span>
                    ) : null}
                  </p>
                  {placing ? (
                    <p className="text-xs text-muted-foreground">Working out who reads it there…</p>
                  ) : pickFailed ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive-ink">
                      Could not work out who reads it there.
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => void picked.refetch()}
                      >
                        Retry
                      </Button>
                    </p>
                  ) : placeShareLine(share) ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {share === 'team' ? (
                        <Users className="size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <Handshake className="size-3.5 shrink-0" aria-hidden />
                      )}
                      {placeShareLine(share)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {pick !== undefined ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setPick(undefined)}
                    >
                      Where filed
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setPicking(true)}
                  >
                    Change…
                  </Button>
                </div>
              </div>
              <FolderPickerDialog
                kind={filed.kind}
                adapter={placeAdapter}
                sort={TREE_KIND_SPECS[filed.kind].sorts[0]!}
                open={picking}
                onOpenChange={setPicking}
                title={`Accept “${item.title || 'Untitled'}” into…`}
                description={
                  filed.creates.length
                    ? `The author’s folders (${filed.creates.join(' / ')}) go below the folder you pick.`
                    : undefined
                }
                rootLabel="Top level"
                currentFolderId={pick === undefined ? filed.folderId : (pick?.id ?? null)}
                onPick={(f) => {
                  setPick(f ? { id: f.id, name: f.name } : null);
                  setPicking(false);
                }}
              />
            </div>
          ) : null}

          {hasFiles ? (
            <div className="space-y-2">
              <Label>Files go to</Label>
              <Select value={folder} onValueChange={setFolder} disabled={busy}>
                <SelectTrigger aria-label="Files folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {folderRows.map((f) => (
                    <SelectItem key={f.path} value={f.path}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {bundleSource ? (
            <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
              {bundle.isError ? (
                <div className="flex items-center justify-between gap-3">
                  <p>{errorMessage(bundle.error, 'Could not work out what moves with it.')}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={bundle.isFetching}
                    onClick={() => void bundle.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : !bundle.data ? (
                <p className="text-muted-foreground">Working out what moves with it…</p>
              ) : (
                <>
                  <p>{bundleSummary(bundle.data.items)}</p>
                  {bundle.data.items.length > 1 ? (
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      {bundle.data.items.slice(1, 11).map((i) => (
                        <li key={i.id} className="truncate">
                          {i.title || 'Untitled'}
                        </li>
                      ))}
                      {bundle.data.items.length > 11 ? (
                        <li>and {bundle.data.items.length - 11} more</li>
                      ) : null}
                    </ul>
                  ) : null}
                  {bundle.data.linksStayingBehind > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {bundle.data.linksStayingBehind === 1
                        ? '1 link points at an item that stays in a personal space; it will not open for readers.'
                        : `${bundle.data.linksStayingBehind} links point at items that stay in a personal space; they will not open for readers.`}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                (!!bundleSource && !bundle.data) ||
                placing ||
                pickFailed ||
                (confirming && !confirmation)
              }
              onClick={() => void accept()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Accept into the brain
            </Button>
          </div>
        </div>
        <VisibilityConfirmDialog pending={exposed} onOpenChange={(o) => !o && setExposed(null)} />
      </DialogContent>
    </Dialog>
  );
}

/** Where an Accept lands, in words: where the author filed it, or the
 *  folder the admin picked (null = the top level). */
function placeLine(
  place: { crumbs: { name: string }[] },
  pick: Pick<TreeFolder, 'name'> | null | undefined,
): string {
  if (pick === undefined) {
    return place.crumbs.length ? place.crumbs.map((c) => c.name).join(' / ') : 'Top level';
  }
  return pick ? pick.name : 'Top level';
}

/** The id of the one tick a brain without a list asks for (the level). */
const LEVEL_TICK = '__level__';

/** What goes down with a client's item, one tick each (audit A28). */
function GoingDownList({
  line,
  items,
  levelTick,
  waiting,
  ticked,
  disabled,
  onTick,
}: {
  line: string;
  items: readonly AccessItemView[];
  /** A single tick for the level itself (a brain that sent no list). */
  levelTick: string | null;
  waiting: boolean;
  ticked: ReadonlySet<string>;
  disabled: boolean;
  onTick: (id: string, on: boolean) => void;
}) {
  const rows = levelTick
    ? [{ id: LEVEL_TICK, label: levelTick, note: null as string | null }]
    : items.map((i) => ({
        id: i.id,
        label: i.title || 'Untitled',
        note: LEVEL_LABEL[i.audience] as string | null,
      }));
  return (
    <div
      role="group"
      aria-label="What goes down with it"
      className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <p className="text-xs text-warning-ink">{line}</p>
      {waiting ? (
        <p className="text-xs text-muted-foreground">Working out what goes down with it…</p>
      ) : rows.length ? (
        <ul className="-mx-1 max-h-40 space-y-1 overflow-y-auto px-1 scrollbar-thin">
          {rows.map((r) => (
            <li key={r.id} className="flex min-w-0 items-center gap-2">
              <Checkbox
                id={`going-down-${r.id}`}
                checked={ticked.has(r.id)}
                disabled={disabled}
                onCheckedChange={(v) => onTick(r.id, v === true)}
              />
              <Label htmlFor={`going-down-${r.id}`} className="min-w-0 flex-1 truncate font-normal">
                {r.label}
              </Label>
              {r.note ? (
                <span className="shrink-0 text-xs text-muted-foreground">{r.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Reject: back to its author, who can change it and submit it again. No
 *  note: review flows carry no messages. On a released taken item this is a
 *  give-back, with what was taken with it. */
export function RejectDialog({ row, onDone, onChanged }: ReviewActionProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await memberReview.giveBack(row.id);
      toast.success(`Rejected “${row.title || 'Untitled'}”: it went back to ${row.author.name}.`);
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(reviewErrorMessage(err, 'Could not reject this item.'));
      setOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Undo2 /> Reject
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject “{row.title || 'Untitled'}”?</AlertDialogTitle>
          <AlertDialogDescription>{rejectConfirm(row)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button disabled={busy} onClick={() => void send()}>
            {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
            Reject
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DiscardDialog({ row, onDone, onChanged }: ReviewActionProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const discard = async () => {
    setBusy(true);
    try {
      await memberReview.discard(row.id);
      toast.success(`Discarded “${row.title || 'Untitled'}”.`);
      onDone();
    } catch (err) {
      toast.error(reviewErrorMessage(err, 'Could not discard this item.'));
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive-ink" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Discard
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this item?</AlertDialogTitle>
          <AlertDialogDescription>
            “{row.title || 'Untitled'}” from {row.author.name} (deactivated) is deleted, with its
            bytes. It never enters the brain. This can&rsquo;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void discard()}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Take over (audit F07): the item, and what it shows, moves into this
 * admin's own private items, out of its author's reach, until the admin
 * accepts it into the brain or gives it back. Nothing is indexed or learned
 * on the way; the admin works on it in the Private view, which opens next.
 */
export function TakeOverDialog({ row, onDone, onChanged }: ReviewActionProps) {
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // What moves with it: the bundle Accept would move is the one recorded at
  // Submit, and that is what Take over moves too.
  const bundle = useQuery({
    queryKey: ['team-admin', 'submissions', row.id, 'bundle'],
    queryFn: () => memberReview.bundle(row.id),
    enabled: open,
  });
  const rest = bundle.data?.items.slice(1) ?? [];
  const take = async () => {
    setBusy(true);
    try {
      const res = await memberReview.takeOver(row.id);
      const also = res.moved.length > 1 ? ` with ${res.moved.length - 1} more` : '';
      toast.success(`Took over “${row.title || 'Untitled'}”${also}. Only you can see it now.`);
      setOpen(false);
      onDone();
      void qc.invalidateQueries({ queryKey: ['admin-space-list'] });
      router.push(privateViewHref(row.type, res.id));
    } catch (err) {
      toast.error(takeOverErrorMessage(err));
      setOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Hand /> Take over
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Take this over?</AlertDialogTitle>
          <AlertDialogDescription>
            “{row.title || 'Untitled'}” moves into your private items, out of {row.author.name}
            &rsquo;s reach, until you accept it into the brain or give it back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
          {bundle.isError ? (
            <p className="text-muted-foreground">
              Could not work out what moves with it. Everything it shows moves along.
            </p>
          ) : !bundle.data ? (
            <p className="text-muted-foreground">Working out what moves with it…</p>
          ) : (
            <>
              <p>{bundleSummary(bundle.data.items)}</p>
              {rest.length ? (
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {rest.slice(0, 10).map((i) => (
                    <li key={i.id} className="truncate">
                      {i.title || 'Untitled'}
                    </li>
                  ))}
                  {rest.length > 10 ? <li>and {rest.length - 10} more</li> : null}
                </ul>
              ) : null}
            </>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button disabled={busy} onClick={() => void take()}>
            {busy ? <Loader2 className="animate-spin" /> : <Hand />}
            Take over
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
