'use client';

/**
 * Accept into the brain. Removed in W5c: the review actions (Approve,
 * Reject, Take over, Discard) went with the review flow; workspaces replace
 * it. `AcceptIntoBrainDialog` stays ONLY for components/member/mine-item.tsx
 * (an admin's own private item, kept until phase W6b, and the member shell
 * another W5c part removes). Delete this file when mine-item.tsx goes.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Handshake, Loader2, Users } from 'lucide-react';
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
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  LEVEL_LABEL,
  LEVEL_MEANING,
  LEVEL_ORDER,
  effectiveOf,
  isAccessLevel,
  offeredUnder,
} from '@/lib/access-levels';
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
  needsLevelConfirm,
  placeIsFor,
  placeShareLine,
  type AcceptInput,
  type AcceptPlace,
  type AcceptResult,
  type Bundle,
} from '@/lib/member-review';
import type { SpaceKind } from '@/lib/member-space';
import { FolderPickerDialog } from '@/components/item-tree/folder-picker';
import { readerTreeAdapter } from '@/components/item-tree/kinds/reader';
import {
  VisibilityConfirmDialog,
  type PendingConfirm,
} from '@/components/item-tree/visibility-confirm';
import { TREE_KIND_SPECS, type TreeFolder } from '@mantle/web-ui/types/tree';

type FolderRow = { path: string; title: string; slug: string };

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
  onOpen,
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
  /** Called as the dialog opens (an Approve takes its pin then). */
  onOpen?: () => void;
}) {
  const toast = useToast();
  const [open, setOpenState] = useState(false);
  const setOpen = (o: boolean) => {
    if (o && !open) onOpen?.();
    setOpenState(o);
  };
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
