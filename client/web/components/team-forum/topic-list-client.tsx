'use client';

/**
 * The Forum — the member's landing surface, replacing the 1:1 assistant chat,
 * now the style guide's master-detail: topic CARDS in a draggable list pane,
 * the selected thread inline beside them (?t=<id>), so opening a topic keeps
 * the list mounted — search text, scroll position and page survive. Pinned
 * topics first (owner announcements), then latest activity; every 'team'
 * topic is visible to every member, plus the member's own private ones. The
 * "New topic" composer (?new=1) renders INLINE in the reader pane — where the
 * thread will live — not as a modal; /team/forum/[id] stays the deep link.
 *
 * Public surface conventions match the team shell: raw fetch (team cookie
 * auth), inline errors, no toasts. The shell TokenGates before children
 * render, so a 401 here means mid-session revocation — surfaced as a plain
 * message rather than a second gate.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpDown,
  ChevronDown,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  Search,
} from 'lucide-react';
import { formShellClass } from '@mantle/web-ui/ui/form-shell';
import { Button } from '@mantle/web-ui/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import {
  ListCard,
  ListCardMeta,
  ListCardSnippet,
  ListCardTitle,
  type ListCardAccent,
} from '@mantle/web-ui/ui/list-card';
import { cn } from '@mantle/web-ui/lib/utils';
import { TopicViewClient } from './topic-view-client';
import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Switch } from '@mantle/web-ui/ui/switch';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import {
  FORUM_KINDS,
  KindBadge,
  TopicFlags,
  kindMeta,
  timeAgo,
  type ForumKind,
  type ForumStatus,
} from '@mantle/web-ui/forum-meta';
import { ComposerAttachments, type StagedUpload } from './attachment-ui';
import { teamFetch } from '@mantle/web-ui/team-fetch';

export type ForumTopicItem = {
  id: string;
  title: string;
  kind: ForumKind;
  visibility: 'team' | 'private';
  pinned: boolean;
  status: ForumStatus;
  authorName: string;
  postCount: number;
  lastPostAt: string;
  createdAt: string;
  lastPostAuthor: string | null;
  lastPostPreview: string | null;
  unread: number;
};

/** The new-topic COMPOSER — an inline form rendered in the reader pane
 *  (?new=1), not a modal: writing a post is reading-adjacent work and the
 *  content area is where the thread will live. Cancel returns to the reader. */
function NewTopicComposer({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<ForumKind>('question');
  const [isPrivate, setIsPrivate] = useState(false);
  // The agent-reply default follows the kind (discussion ⇒ off) until the
  // member touches the checkbox themselves.
  const [noReply, setNoReply] = useState(false);
  const [noReplyTouched, setNoReplyTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedUpload[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);

  const effectiveNoReply = noReplyTouched ? noReply : kind === 'discussion';

  const create = async () => {
    if (!title.trim() || !body.trim() || submitting || attachBusy) return;
    setSubmitting(true);
    setError(null);
    try {
      const attachmentIds = staged.map((s) => s.blobId);
      const r = await teamFetch('/api/team/forum/topics', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          kind,
          visibility: isPrivate ? 'private' : 'team',
          noReply: effectiveNoReply,
          ...(attachmentIds.length ? { attachmentIds } : {}),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        topicId?: string;
        turnId?: string;
        error?: string;
      };
      if (!r.ok || !data.topicId) {
        setError(data.error ?? 'Could not create the topic — try again.');
        setSubmitting(false);
        return;
      }
      // Open the new topic INLINE (?t=), keeping the list mounted; ?turn=
      // attaches the view to the in-flight stream instead of a refetch wait.
      const turn = data.turnId ? `&turn=${encodeURIComponent(data.turnId)}` : '';
      router.push(`/team/forum?t=${encodeURIComponent(data.topicId)}${turn}`);
    } catch {
      setError('Could not reach the server — try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="p-6">
        {/* §6c boxed, left-aligned card, full width — the same container the
            owner's New task / New event composers use, so the two sides of
            the product agree on what "a create form" looks like. */}
        <div className={formShellClass}>
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="size-5 text-primary-ink" aria-hidden />
            <h2 className="text-lg font-semibold">New topic</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Start a thread the whole team can read. The assistant answers unless you wave it off.
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="forum-topic-title">Title</Label>
              <Input
                id="forum-topic-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="One line the team will recognize it by"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ForumKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORUM_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`size-1.5 rounded-full ${k.dot}`} aria-hidden />
                        {k.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{kindMeta(kind).hint}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="forum-topic-body">Your post</Label>
              <Textarea
                id="forum-topic-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Ask, propose, or report — the more context, the better the answer."
              />
              <ComposerAttachments
                staged={staged}
                onStagedChange={setStaged}
                onUploadingChange={setAttachBusy}
                disabled={submitting}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={effectiveNoReply}
                  onCheckedChange={(v) => {
                    setNoReplyTouched(true);
                    setNoReply(v === true);
                  }}
                />
                No answer needed
              </label>
              <label className="flex items-center gap-2 text-sm">
                Private
                <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
              </label>
            </div>
            {isPrivate && (
              <p className="text-xs text-muted-foreground">
                Private topics are visible only to you and the brain owner, and are never added to
                the brain&rsquo;s shared knowledge.
              </p>
            )}
            {error && <p className="text-sm text-destructive-ink">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
              <SubmitButton
                pending={submitting}
                onClick={() => void create()}
                disabled={!title.trim() || !body.trim() || attachBusy}
              >
                Create topic
              </SubmitButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type TopicListResponse = {
  topics: ForumTopicItem[];
  total: number;
  page: number;
  pageSize: number;
};

type TopicSort = 'activity' | 'newest' | 'oldest' | 'title';

const SORT_LABELS: Record<TopicSort, string> = {
  activity: 'Latest activity',
  newest: 'Newest topics',
  oldest: 'Oldest topics',
  title: 'Title A–Z',
};

const SORTS = Object.keys(SORT_LABELS) as TopicSort[];

export function TopicListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sortParam = searchParams.get('sort');
  const sort: TopicSort = SORTS.includes(sortParam as TopicSort)
    ? (sortParam as TopicSort)
    : 'activity';

  const [data, setData] = useState<TopicListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(query);

  const go = useCallback(
    (patch: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') params.delete(k);
        else params.set(k, String(v));
      }
      const s = params.toString();
      router.replace(s ? `/team/forum?${s}` : '/team/forum', { scroll: false });
    },
    [router, searchParams],
  );

  const refetch = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (sort !== 'activity') qs.set('sort', sort);
      if (page > 1) qs.set('page', String(page));
      const s = qs.toString();
      const r = await teamFetch(`/api/team/forum/topics${s ? `?${s}` : ''}`, { cache: 'no-store' });
      if (r.status === 401) {
        setError('Your team session ended — reload the page to sign in again.');
        return;
      }
      if (!r.ok) return;
      setData((await r.json()) as TopicListResponse);
      setError(null);
    } catch {
      /* network blip — keep current state */
    }
  }, [query, sort, page]);

  useEffect(() => {
    void refetch();
    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  // Debounced search: push ?q= when the INPUT changes. When ?q= moves without
  // an input edit (back/forward, external link), adopt it into the box instead
  // of re-pushing stale text — lastInputRef tells the two cases apart.
  const lastInputRef = useRef(searchInput);
  useEffect(() => {
    if (searchInput === lastInputRef.current) {
      if (query !== searchInput.trim()) {
        lastInputRef.current = query;
        setSearchInput(query);
      }
      return;
    }
    lastInputRef.current = searchInput;
    if (searchInput.trim() === query) return;
    const t = setTimeout(() => go({ q: searchInput.trim() || null, page: null }), 300);
    return () => clearTimeout(t);
  }, [searchInput, query, go]);

  const topics = data?.topics ?? null;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;

  // Selection is URL-driven (?t=), so a topic link is copyable and the whole
  // view is refresh-safe. Auto-select the first topic so the right pane is
  // never blank — but only as a RENDER fallback, never written to the URL:
  // below `md` the panes stack, and there the thread renders only for an
  // explicit selection (the team-section trade), so the phone lands on the
  // list, not on a thread it didn't ask for.
  const urlSelectedId = searchParams.get('t');
  const turnParam = searchParams.get('turn') ?? undefined;
  const selectedId = urlSelectedId ?? topics?.[0]?.id ?? null;
  // ?new=1 turns the reader pane into the new-topic composer (no modal — the
  // form lives where the thread will). Mutually exclusive with ?t=.
  const newMode = searchParams.get('new') === '1';
  const openComposer = () => go({ new: '1', t: null, turn: null });

  // Card hrefs keep the list's own state (?q / ?sort / ?page) and drop a stale
  // ?turn — that param belongs to the topic it was minted with.
  const hrefFor = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('t', id);
    params.delete('turn');
    return `/team/forum?${params.toString()}`;
  };

  const listPane = (
    // `h-full`, not `flex-1`: MasterDetail's pane wrappers are blocks, so a
    // flex property here would be inert and the column would size to its
    // content. The mobile hides are `max-md:` because below `md` the scaffold
    // stacks the panes instead of dropping them.
    <div
      className={cn('flex h-full min-h-0 flex-col', (urlSelectedId || newMode) && 'max-md:hidden')}
    >
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Forum</h1>
            <p className="truncate text-xs text-muted-foreground">
              Shared with the whole team · the brain answers
            </p>
          </div>
          <Button size="sm" onClick={openComposer}>
            <MessageSquarePlus /> New topic
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search topics and posts…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground"
                title="Sort topics"
              >
                <ArrowUpDown className="size-3.5" />
                {SORT_LABELS[sort]}
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(v) => go({ sort: v === 'activity' ? null : v, page: null })}
              >
                {SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s} value={s}>
                    {SORT_LABELS[s]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="xs" className="text-muted-foreground" asChild>
            <Link href="/team/assistant">Chat archive</Link>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin">
        {error ? (
          <p className="py-10 text-center text-sm text-destructive-ink">{error}</p>
        ) : topics === null ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-label="Loading topics" />
          </div>
        ) : topics.length === 0 ? (
          query ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No topics or posts match “{query}”.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-4 py-12 text-center">
              <MessagesSquare className="size-6 text-muted-foreground" aria-hidden />
              <p className="max-w-sm text-sm text-muted-foreground">
                No topics yet. Start one — questions, ideas, reviews, bugs. The whole team sees the
                thread, and the brain answers.
              </p>
              <Button size="sm" onClick={openComposer}>
                <MessageSquarePlus /> New topic
              </Button>
            </div>
          )
        ) : (
          topics.map((t) => (
            <ListCard
              key={t.id}
              asChild
              selected={t.id === selectedId}
              accent={topicAccent(t)}
              dimmed={t.status === 'closed'}
            >
              <Link href={hrefFor(t.id)}>
                <div className="flex items-center gap-2">
                  {t.unread > 0 && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-primary"
                      aria-label={`${t.unread} unread`}
                    />
                  )}
                  <ListCardTitle className="min-w-0 flex-1">{t.title}</ListCardTitle>
                  <TopicFlags pinned={t.pinned} visibility={t.visibility} status={t.status} />
                  <KindBadge kind={t.kind} />
                </div>
                {t.lastPostPreview && (
                  <ListCardSnippet>
                    {t.lastPostAuthor ? `${t.lastPostAuthor}: ` : ''}
                    {t.lastPostPreview}
                  </ListCardSnippet>
                )}
                <ListCardMeta>
                  {t.authorName} · {t.postCount} {t.postCount === 1 ? 'post' : 'posts'} ·{' '}
                  {timeAgo(t.lastPostAt)}
                </ListCardMeta>
              </Link>
            </ListCard>
          ))
        )}
      </div>

      {topics !== null && (
        <div className="shrink-0 px-3">
          {/* page/total/pageSize all come from the same response snapshot, so
              the pager never mixes a new URL page with a stale total. */}
          <ListPager
            page={data?.page ?? page}
            total={total}
            pageSize={pageSize}
            onGo={(p) => go({ page: p <= 1 ? null : p })}
          />
        </div>
      )}
    </div>
  );

  const detailPane = (
    <div className={cn('h-full min-h-0', !urlSelectedId && !newMode && 'max-md:hidden')}>
      {newMode ? (
        <NewTopicComposer onCancel={() => go({ new: null })} />
      ) : selectedId ? (
        // `key` remounts the view per topic, so thread state (scroll, search,
        // composer draft) never leaks between topics. `initialTurnId` applies
        // only to the topic it was minted with.
        <TopicViewClient
          key={selectedId}
          topicId={selectedId}
          initialTurnId={urlSelectedId === selectedId ? turnParam : undefined}
          embedded
          markRead={urlSelectedId !== null}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">Select a topic to read it.</p>
        </div>
      )}
    </div>
  );

  // Three panels (a thread is prose the reader READS — it wants a measure AND
  // a right edge, so not `detailFills`), opening at 900px with the ceiling at
  // the window (`maxDetailSize="100%"` lets the drag run the spacer to zero).
  // The list range is wider than the scaffold default both ways: 220px still
  // reads (title truncates, snippet clamps), and 720px serves a member
  // scanning what's new by snippet.
  return (
    <MasterDetail
      id="team-forum"
      list={listPane}
      detail={detailPane}
      minListSize="220px"
      defaultListSize="360px"
      maxListSize="720px"
      minDetailSize="420px"
      defaultDetailSize="900px"
      maxDetailSize="100%"
    />
  );
}

/** The card's attention marker (§8: the `accent` bar, one per card, most
 *  urgent wins): a pinned topic is an owner announcement, unread is what the
 *  member came to find, and an open bug wants eyes. Answered/closed topics
 *  are `dimmed` instead — an accent on a settled thread is noise. */
function topicAccent(t: ForumTopicItem): ListCardAccent | undefined {
  if (t.pinned) return 'primary';
  if (t.unread > 0) return 'info';
  if (t.kind === 'bug' && t.status === 'open') return 'warning';
  return undefined;
}
