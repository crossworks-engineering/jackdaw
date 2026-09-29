'use client';

/**
 * The review actions (member logins Phase 4): Accept into the brain (the
 * admin picks the level, and for a page or files where they land), Return
 * with a note, and Discard for an item a deactivated login left behind. The
 * accept dialog also serves an admin's own private items (Phase 7).
 */
import { useState, type ReactNode } from 'react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Hand, Loader2, Trash2, Undo2 } from 'lucide-react';
import type { AccessItemView, AccessLevel } from '@mantle/client-types';
import type { ReviewAuthorRole } from '@/lib/contract-next';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
import { RadioGroup, RadioGroupItem } from '@mantle/web-ui/ui/radio-group';
import { Textarea } from '@mantle/web-ui/ui/textarea';
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
import { LEVEL_LABEL, LEVEL_MEANING, LEVEL_ORDER, isAccessLevel } from '@/lib/access-levels';
import { privateViewHref } from '@/lib/admin-private';
import {
  TOP_OF_PAGES,
  authorRoleLabel,
  bundleSummary,
  confirmLevelRefusal,
  defaultAcceptLevel,
  goingDownAt,
  goingDownLine,
  levelConfirmation,
  memberReview,
  needsLevelConfirm,
  reviewErrorMessage,
  shownParent,
  takeOverErrorMessage,
  type AcceptInput,
  type AcceptResult,
  type Bundle,
  type ReviewItemRow,
} from '@/lib/member-review';
import type { SpaceKind } from '@/lib/member-space';

const TOP = TOP_OF_PAGES;

type FolderRow = { path: string; title: string; slug: string };
type PageRow = { id: string; title: string };

/** Back to the queue once the item is handled: its row is gone. */
function useBackToQueue(onDone: () => void) {
  const router = useRouter();
  return () => {
    onDone();
    router.replace('/team-admin?view=review');
  };
}

export function AcceptDialog({ row, onDone }: { row: ReviewItemRow; onDone: () => void }) {
  const back = useBackToQueue(onDone);
  return (
    <AcceptIntoBrainDialog
      item={row}
      authorRole={row.author.role}
      description={
        <>
          “{row.title || 'Untitled'}” moves out of {row.author.name}&rsquo;s space and becomes a
          brain item you can edit. Links to it keep working.
        </>
      }
      bundle={{
        key: ['team-admin', 'submissions', row.id, 'bundle'],
        load: () => memberReview.bundle(row.id),
      }}
      accept={(input) => memberReview.accept(row.id, input)}
      onAccepted={back}
      onFailed={onDone}
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
  bundle?: { key: readonly unknown[]; load: () => Promise<Bundle> };
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
  const [level, setLevel] = useState<AccessLevel>(() => defaultAcceptLevel(authorRole));
  // What the admin ticked of what goes down, and the brain's own ask when it
  // refused the level (409 confirm-level); both start over on a new level.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<{
    level: AccessLevel;
    message: string;
    goingDown: AccessItemView[] | null;
  } | null>(null);
  const [folder, setFolder] = useState('files');
  const [parent, setParent] = useState<string>(TOP);
  const [pageQuery, setPageQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const bundle = useQuery({
    queryKey: bundleSource?.key ?? ['accept-bundle', 'none'],
    queryFn: () => bundleSource!.load(),
    enabled: open && !!bundleSource,
  });
  const hasFiles = bundleSource
    ? (bundle.data?.items.some((i) => i.type === 'file') ?? false)
    : item.type === 'file';
  const folders = useQuery({
    queryKey: ['files', 'tree'],
    queryFn: () => apiFetch<{ folders: FolderRow[] }>('/api/files/folders?tree=true'),
    enabled: open && hasFiles,
  });
  const q = pageQuery.trim();
  const pages = useQuery({
    queryKey: ['pages', { q, review: true }],
    queryFn: () => apiFetch<{ pages: PageRow[] }>(`/api/pages?q=${encodeURIComponent(q)}`),
    enabled: open && item.type === 'page' && q.length > 1,
  });
  const parentChoices = [
    { id: TOP, title: 'Top of Pages' },
    ...(pages.data?.pages ?? []).slice(0, 8),
  ];
  // What is shown is what is sent: a parent a new search hid is dropped.
  const parentId = shownParent(
    parent,
    parentChoices.map((p) => p.id),
  );

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
    setLevel(v);
    setTicked(new Set());
  };
  const tick = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const accept = async () => {
    setBusy(true);
    try {
      if (beforeAccept && !(await beforeAccept())) return;
      const input: AcceptInput = {
        audience: level,
        parentPageId: item.type === 'page' && parentId !== TOP ? parentId : null,
        folderPath: hasFiles ? folder : null,
        ...(confirmation ?? {}),
      };
      const res = await send(input);
      toast.success(
        `Accepted “${item.title || 'Untitled'}” into the brain at ${LEVEL_LABEL[res.audience]}.`,
      );
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
                <ToggleGroupItem key={l} value={l} className="flex-1" aria-label={LEVEL_LABEL[l]}>
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

          {item.type === 'page' ? (
            <div className="space-y-2">
              <Label htmlFor="review-parent">Where the page goes</Label>
              <Input
                id="review-parent"
                placeholder="Search for a parent page (or leave it at the top of Pages)"
                value={pageQuery}
                disabled={busy}
                onChange={(e) => setPageQuery(e.target.value)}
              />
              <RadioGroup
                aria-label="Parent page"
                className="gap-1 text-sm"
                value={parentId}
                disabled={busy}
                onValueChange={setParent}
              >
                {parentChoices.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <RadioGroupItem value={p.id} id={`review-parent-${p.id}`} />
                    <Label htmlFor={`review-parent-${p.id}`} className="truncate font-normal">
                      {p.title || 'Untitled page'}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
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
              disabled={busy || (!!bundleSource && !bundle.data) || (confirming && !confirmation)}
              onClick={() => void accept()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Accept into the brain
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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

export function ReturnDialog({ row, onDone }: { row: ReviewItemRow; onDone: () => void }) {
  const toast = useToast();
  const back = useBackToQueue(onDone);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await memberReview.giveBack(row.id, note);
      toast.success(`Returned “${row.title || 'Untitled'}” to ${row.author.name}.`);
      setOpen(false);
      setNote('');
      back();
    } catch (err) {
      toast.error(reviewErrorMessage(err, 'Could not return this item.'));
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Undo2 /> Return
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return to {row.author.name}</DialogTitle>
          <DialogDescription>
            The item goes back to its author with your note. They can change it and submit it again.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) void send();
          }}
        >
          <Label htmlFor="review-return-note">What needs to change</Label>
          <Textarea
            id="review-return-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={4000}
            disabled={busy}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !note.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
              Return with note
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DiscardDialog({ row, onDone }: { row: ReviewItemRow; onDone: () => void }) {
  const toast = useToast();
  const back = useBackToQueue(onDone);
  const [busy, setBusy] = useState(false);
  const discard = async () => {
    setBusy(true);
    try {
      await memberReview.discard(row.id);
      toast.success(`Discarded “${row.title || 'Untitled'}”.`);
      back();
    } catch (err) {
      toast.error(reviewErrorMessage(err, 'Could not discard this item.'));
      onDone();
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
export function TakeOverDialog({ row, onDone }: { row: ReviewItemRow; onDone: () => void }) {
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
      onDone();
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
