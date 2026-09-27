'use client';

/**
 * The review actions (member logins Phase 4): Accept into the brain (the
 * admin picks the level, and for a page or files where they land), Return
 * with a note, and Discard for an item a deactivated login left behind.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Trash2, Undo2 } from 'lucide-react';
import type { AccessLevel } from '@mantle/client-types';
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
import {
  bundleSummary,
  memberReview,
  reviewErrorMessage,
  type ReviewItemRow,
} from '@/lib/member-review';

const TOP = '__top__';

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
  const toast = useToast();
  const back = useBackToQueue(onDone);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<AccessLevel>('admin');
  const [folder, setFolder] = useState('files');
  const [parent, setParent] = useState<string>(TOP);
  const [pageQuery, setPageQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const bundle = useQuery({
    queryKey: ['team-admin', 'submissions', row.id, 'bundle'],
    queryFn: () => memberReview.bundle(row.id),
    enabled: open,
  });
  const hasFiles = bundle.data?.items.some((i) => i.type === 'file') ?? false;
  const folders = useQuery({
    queryKey: ['files', 'tree'],
    queryFn: () => apiFetch<{ folders: FolderRow[] }>('/api/files/folders?tree=true'),
    enabled: open && hasFiles,
  });
  const q = pageQuery.trim();
  const pages = useQuery({
    queryKey: ['pages', { q, review: true }],
    queryFn: () => apiFetch<{ pages: PageRow[] }>(`/api/pages?q=${encodeURIComponent(q)}`),
    enabled: open && row.type === 'page' && q.length > 1,
  });

  const accept = async () => {
    setBusy(true);
    try {
      const res = await memberReview.accept(row.id, {
        audience: level,
        parentPageId: row.type === 'page' && parent !== TOP ? parent : null,
        folderPath: hasFiles ? folder : null,
      });
      toast.success(
        `Accepted “${row.title || 'Untitled'}” into the brain at ${LEVEL_LABEL[res.audience]}.`,
      );
      if (res.levelWarning) toast.error(`Level set, link not made: ${res.levelWarning}`);
      setOpen(false);
      back();
    } catch (err) {
      toast.error(reviewErrorMessage(err, 'Could not accept this item.'));
      onDone();
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
        label: `${'  '.repeat(f.path.split('.').length - 2)}${f.title || f.slug}`,
      })),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 /> Accept
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept into the brain</DialogTitle>
          <DialogDescription>
            “{row.title || 'Untitled'}” moves out of {row.author.name}&rsquo;s space and becomes a
            brain item you can edit. Links to it keep working.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Who can see it</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              loop={false}
              value={level}
              disabled={busy}
              onValueChange={(v) => {
                if (isAccessLevel(v)) setLevel(v);
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

          {row.type === 'page' ? (
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
                value={parent}
                disabled={busy}
                onValueChange={setParent}
              >
                {[{ id: TOP, title: 'Top of Pages' }, ...(pages.data?.pages ?? []).slice(0, 8)].map(
                  (p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <RadioGroupItem value={p.id} id={`review-parent-${p.id}`} />
                      <Label htmlFor={`review-parent-${p.id}`} className="truncate font-normal">
                        {p.title || 'Untitled page'}
                      </Label>
                    </div>
                  ),
                )}
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

          <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
            {bundle.isError ? (
              <p>{reviewErrorMessage(bundle.error, 'Could not work out what moves with it.')}</p>
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

          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !bundle.data} onClick={() => void accept()}>
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Accept into the brain
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
