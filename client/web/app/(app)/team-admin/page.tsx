'use client';

/**
 * /team-admin — the owner's window into the external team surface.
 *
 * Tabs: Members · Topics · Requests · Shared links · Settings.
 *
 * The T5 rehome of the old server-rendered server/web page: the JSX is a
 * near-verbatim carry-over, but data now arrives per tab from
 * GET /api/team-admin/{members,topics,requests,shares,settings} via apiFetch
 * (owner bearer cross-origin, cookie same-origin) — this app is zero-secret
 * and reads no DB. URL-driven exactly as before (?view/contact/topic/q/page/
 * apage), so every deep link keeps working. The old render side effects
 * (mark thread/topic read) became explicit POSTs fired once the pane is
 * actually on screen.
 */
import Link from 'next/link';
import { use, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type {
  TeamMemberActivity,
  TeamRequest,
  ForumTopicListItem,
  PendingForumUpload,
  ForumMemberActivity,
  ForumMemberPost,
  ForumAuthoredTopic,
} from '@mantle/client-types';
import { SharedLinksPanel, type SharedLinkRow } from '@/components/share/shared-links-panel';
import { HubAppPicker } from '@/components/team-chat/hub-app-picker';
import { DashboardTagsPanel } from '@/components/team-chat/dashboard-tags-panel';
import { PrivateReadsToggle } from '@/components/team-chat/private-reads-toggle';
import { RequestReply } from '@/components/team-chat/request-reply';
import { ThreadAccessSplit } from '@/components/team-chat/access-split';
import {
  AdminTopicPager,
  AdminTopicSearch,
  TopicPinToggle,
  TopicReplyForm,
} from '@/components/team-forum/admin-topic-controls';
import {
  UploadReviewActions,
  AdminDownloadLink,
} from '@/components/team-forum/admin-upload-controls';
import { formatSize } from '@/components/team-forum/attachment-ui';
import { KindBadge, TopicFlags } from '@mantle/web-ui/forum-meta';
import {
  Archive,
  MessagesSquare,
  ExternalLink,
  Inbox,
  CheckCircle2,
  Paperclip,
  Users,
} from 'lucide-react';
import { MemberActivityPager } from '@/components/team-admin/member-activity-pager';
import { cn } from '@mantle/web-ui/lib/utils';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { MeasuredPane } from '@mantle/web-ui/ui/measured-pane';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function fmtWhen(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Response shapes (Dates arrive as ISO strings over JSON) ─────────────────

type Badges = { openRequestCount: number; openRequests: number; pendingUploadCount: number };

type MemberRow = TeamMemberActivity & { forum: ForumMemberActivity | null };

type ArchiveMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  text: string;
  status: string;
  error: string | null;
  traceId: string | null;
  createdAt: string;
};

type AccessRow = { id: string; kind: string; detail: unknown; createdAt: string };

type MembersResponse = {
  badges: Badges;
  members: MemberRow[];
  selected: {
    contactId: string;
    activityPage: number;
    activityPageSize: number;
    posts: ForumMemberPost[];
    postTotal: number;
    authored: ForumAuthoredTopic[];
    requests: TeamRequest[];
    thread: ArchiveMessage[];
    access: AccessRow[];
  } | null;
};

type SelectedTopic = {
  id: string;
  title: string;
  kind: ForumTopicListItem['kind'];
  visibility: ForumTopicListItem['visibility'];
  pinned: boolean;
  status: ForumTopicListItem['status'];
  authorName: string;
  createdAt: string;
};

type TopicPost = {
  id: string;
  authorKind: 'member' | 'owner' | 'agent';
  authorName: string;
  body: string;
  status: 'pending' | 'complete' | 'failed';
  error: string | null;
  traceId: string | null;
  attachments: Array<{ fileId?: string | null; caption?: string | null }>;
  createdAt: string;
};

type TopicsResponse = {
  badges: Badges;
  topics: ForumTopicListItem[];
  topicTotal: number;
  page: number;
  pageSize: number;
  selected: {
    topic: SelectedTopic;
    posts: TopicPost[];
    uploadStates: Array<{ id: string; status: string }>;
  } | null;
};

type RequestsResponse = {
  badges: Badges;
  requests: TeamRequest[];
  uploads: PendingForumUpload[];
  moreUploads: number;
};

type SharesResponse = { badges: Badges; shares: SharedLinkRow[] };

type SettingsResponse = {
  badges: Badges;
  privateReads: boolean;
  hubAppId: string | null;
  hubCandidates: Array<{ id: string; title: string }>;
  dashboardTags: { selected: string[]; available: Array<{ tag: string; count: number }> };
};

// ── Shared pieces (carried over from the SSR page) ──────────────────────────

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function TeamTabs({
  active,
  openRequestCount,
}: {
  active: 'members' | 'topics' | 'requests' | 'shares' | 'settings';
  openRequestCount: number;
}) {
  const tab = (label: string, href: string, isActive: boolean, badge?: number) => (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
        isActive
          ? 'border-primary font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {badge ? (
        <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </Link>
  );
  return (
    // A labelled `nav`, not a bare div: these five are navigation, and the name
    // is what tells "Settings the tab" apart from "Settings the sidebar row"
    // now that the sidebar has one. Screen readers get the same benefit.
    <nav aria-label="Team admin" className="flex items-center gap-1 border-b border-border px-3">
      {tab('Members', '/team-admin', active === 'members')}
      {tab('Topics', '/team-admin?view=topics', active === 'topics')}
      {tab('Requests', '/team-admin?view=requests', active === 'requests', openRequestCount)}
      {tab('Shared links', '/team-admin?view=shares', active === 'shares')}
      {tab('Settings', '/team-admin?view=settings', active === 'settings')}
    </nav>
  );
}

function MemberList({ members, selectedId }: { members: MemberRow[]; selectedId: string | null }) {
  if (members.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No team members yet. Enable a contact as a team member from their page in{' '}
        <Link href="/contacts" className="underline">
          Contacts
        </Link>{' '}
        — their token is what unlocks <code>/team</code>.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2 p-3">
      {members.map((m) => (
        <li key={m.contactId}>
          <ListCard asChild selected={m.contactId === selectedId}>
            <Link href={`/team-admin?contact=${m.contactId}`}>
              <div className="flex items-baseline justify-between gap-2">
                <ListCardTitle>{m.contactName}</ListCardTitle>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {(m.forum?.unread ?? 0) > 0 ? (
                    <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                      {m.forum?.unread}
                    </span>
                  ) : null}
                  {fmtWhen(m.forum?.lastPostAt ?? null)}
                </span>
              </div>
              <ListCardMeta>
                {m.forum?.lastPostBody
                  ? `${m.forum.lastPostTopicTitle ? `${m.forum.lastPostTopicTitle} — ` : ''}${m.forum.lastPostBody}`
                  : `member since ${fmtWhen(m.memberSince)} — no posts yet`}
              </ListCardMeta>
            </Link>
          </ListCard>
        </li>
      ))}
    </ul>
  );
}

/** A request's open/done pill — inline beside the title, per the detail-header
 *  anatomy, and on the list cards. */
function RequestStatusPill({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs',
        done ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary-ink',
      )}
    >
      {done ? <CheckCircle2 className="size-3" /> : null}
      {done ? 'done' : 'open'}
    </span>
  );
}

function ActivityPost({ post }: { post: ForumMemberPost }) {
  return (
    <li className="rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2 text-xs">
        <Link
          href={`/team-admin?view=topics&topic=${post.topicId}`}
          className="min-w-0 truncate font-medium underline-offset-2 hover:underline"
        >
          {post.topicTitle}
        </Link>
        <TopicFlags pinned={false} visibility={post.topicVisibility} status={post.topicStatus} />
        {post.kind ? <KindBadge kind={post.kind} /> : null}
        <span className="ml-auto shrink-0 text-muted-foreground">{fmtWhen(post.createdAt)}</span>
      </div>
      <div className="px-3 py-2">
        <p className="whitespace-pre-wrap text-sm">{post.body}</p>
        {post.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {post.attachments.map((a, i) => (
              <span
                key={a.fileId ?? `${post.id}-${i}`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                <Paperclip className="size-3" aria-hidden />
                {a.caption ?? 'attachment'}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border/60 bg-muted/30 px-3 py-2">
        {post.reply === null ? (
          <p className="text-xs italic text-muted-foreground">No assistant answer to this post.</p>
        ) : post.reply.status === 'pending' ? (
          <p className="text-xs italic text-muted-foreground">answering…</p>
        ) : post.reply.status === 'failed' ? (
          <p className="text-xs text-destructive-ink">
            Turn failed: {post.reply.error ?? 'unknown error'}
          </p>
        ) : (
          <>
            <div className="mb-1 flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{post.reply.authorName}</span>
              <span>{fmtWhen(post.reply.createdAt)}</span>
              {post.reply.traceId ? (
                <Link
                  href={`/traces/${post.reply.traceId}`}
                  className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  <ExternalLink className="size-3" /> trace
                </Link>
              ) : null}
            </div>
            <div className="prose prose-accent prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.reply.body}</ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function AuthoredTopics({ topics }: { topics: ForumAuthoredTopic[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Topics started
      </h3>
      <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card text-card-foreground">
        {topics.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <Link
              href={`/team-admin?view=topics&topic=${t.id}`}
              className="min-w-0 truncate text-sm underline-offset-2 hover:underline"
            >
              {t.title}
            </Link>
            <TopicFlags pinned={t.pinned} visibility={t.visibility} status={t.status} />
            <KindBadge kind={t.kind} />
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {t.postCount} {t.postCount === 1 ? 'post' : 'posts'} · {fmtWhen(t.lastPostAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MemberRequestList({ requests }: { requests: TeamRequest[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Requests filed
      </h3>
      <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card text-card-foreground">
        {requests.map((r) => (
          <li key={r.taskId} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <Link
              href={`/tasks?selected=${r.taskId}`}
              className="min-w-0 truncate text-sm underline-offset-2 hover:underline"
            >
              {r.title}
            </Link>
            <RequestStatusPill done={r.status === 'done'} />
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {fmtWhen(r.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChatArchive({ thread, count }: { thread: ArchiveMessage[]; count: number }) {
  return (
    <details className="rounded-lg border border-border bg-card text-card-foreground">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <Archive className="size-3.5" aria-hidden />
        Chat archive ({count} {count === 1 ? 'message' : 'messages'})
        <span className="font-normal">— the 1:1 thread, before the Forum</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border/60 px-3 py-3">
        {thread.length < count && (
          <p className="text-center text-xs text-muted-foreground">
            Showing the latest {thread.length} of {count}.
          </p>
        )}
        {thread.map((m) =>
          m.direction === 'inbound' ? (
            <div
              key={m.id}
              className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className="mt-1 text-right text-xs text-primary-foreground/70">
                {fmtWhen(m.createdAt)}
              </p>
            </div>
          ) : (
            <div key={m.id} className="mr-auto w-full max-w-[85%] rounded-lg bg-muted/40 px-3 py-2">
              {m.status === 'failed' ? (
                <p className="text-sm text-destructive-ink">
                  Turn failed: {m.error ?? 'unknown error'}
                </p>
              ) : (
                <div className="prose prose-accent prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{fmtWhen(m.createdAt)}</span>
                {m.traceId ? (
                  <Link
                    href={`/traces/${m.traceId}`}
                    className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  >
                    <ExternalLink className="size-3" /> trace
                  </Link>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>
    </details>
  );
}

// ── Tab panels (each owns its query) ────────────────────────────────────────

function Tab({
  badges,
  active,
  children,
}: {
  badges?: Badges;
  active: Parameters<typeof TeamTabs>[0]['active'];
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <TeamTabs active={active} openRequestCount={badges?.openRequestCount ?? 0} />
      {children}
    </div>
  );
}

function MembersTab({ contact, apage }: { contact?: string; apage?: string }) {
  const qs = new URLSearchParams();
  if (contact) qs.set('contact', contact);
  if (apage) qs.set('apage', apage);
  const q = useQuery({
    queryKey: ['team-admin', 'members', contact ?? null, apage ?? null],
    queryFn: () => apiFetch<MembersResponse>(`/api/team-admin/members?${qs.toString()}`),
  });
  const data = q.data;
  const selected = data?.selected ?? null;
  const selectedMember = selected
    ? (data?.members.find((m) => m.contactId === selected.contactId) ?? null)
    : null;

  // The old SSR page advanced the pre-Forum chat cursor as a render side
  // effect; now it's explicit, and only for members actually carrying an
  // archive (a post-Forum brain never gets a write).
  useEffect(() => {
    if (selected && selectedMember && selectedMember.messageCount > 0) {
      void apiSend(`/api/team-admin/members/${selected.contactId}/thread-read`, 'POST').catch(
        () => {},
      );
    }
  }, [selected, selectedMember]);

  if (!data)
    return (
      <Tab active="members">
        <Loading />
      </Tab>
    );

  const activityPage = selected?.activityPage ?? 1;
  return (
    <Tab active="members" badges={data.badges}>
      <MasterDetail
        // Its OWN key, not one shared with the Topics tab below: the two tabs
        // list different things at different lengths, so a width dragged for a
        // member list has no business setting the forum's.
        id="team-admin-members"
        // The tab strip stays full width above; the scaffold is what is left.
        className="min-h-0 flex-1"
        // The 340px this tab has always had.
        defaultListSize="340px"
        // Three panels, not two: the transcript is reading text, so it gets the
        // master-detail default — a fixed, draggable width tucked against the
        // list, with the spacer as its right edge. It opens at the 3xl measure
        // the old centred column used, and the cap is the window itself.
        defaultDetailSize="768px"
        maxDetailSize="100%"
        list={
          <>
            <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Team members</h2>
              {data.members.length > 0 && (
                <span className="text-xs text-muted-foreground">{data.members.length}</span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <MemberList members={data.members} selectedId={selected?.contactId ?? null} />
            </div>
          </>
        }
        detail={
          <section className="flex h-full min-h-0 flex-col">
            {selected && selectedMember ? (
              <>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">{selectedMember.contactName}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.postTotal} {selected.postTotal === 1 ? 'post' : 'posts'} ·{' '}
                      {selectedMember.forum?.topicsStarted ?? 0} started · member since{' '}
                      {fmtWhen(selectedMember.memberSince)} · token last used{' '}
                      {fmtWhen(selectedMember.tokenLastUsedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/contacts?selected=${selectedMember.contactId}`}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Manage token →
                  </Link>
                </div>
                <ThreadAccessSplit
                  thread={
                    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                      <div className="w-full space-y-5 p-4">
                        {selected.requests.length > 0 && (
                          <MemberRequestList requests={selected.requests} />
                        )}
                        {selected.authored.length > 0 && (
                          <AuthoredTopics topics={selected.authored} />
                        )}
                        <section className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Posts &amp; answers
                          </h3>
                          {selected.posts.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                              {selectedMember.messageCount > 0
                                ? 'Nothing in the Forum yet — their conversation predates it. The archive is below.'
                                : `${selectedMember.contactName} hasn’t posted in the Forum yet.`}
                            </p>
                          ) : (
                            <>
                              <ul className="flex flex-col gap-3">
                                {selected.posts.map((p) => (
                                  <ActivityPost key={p.id} post={p} />
                                ))}
                              </ul>
                              {selected.postTotal > selected.activityPageSize && (
                                <MemberActivityPager
                                  page={activityPage}
                                  total={selected.postTotal}
                                  pageSize={selected.activityPageSize}
                                />
                              )}
                            </>
                          )}
                        </section>
                        {selectedMember.messageCount > 0 && (
                          <ChatArchive
                            thread={selected.thread}
                            count={selectedMember.messageCount}
                          />
                        )}
                      </div>
                    </div>
                  }
                  access={
                    selected.access.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No access events yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {selected.access.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center gap-2 text-xs text-muted-foreground"
                          >
                            <span className="w-14 shrink-0 font-medium text-foreground">
                              {a.kind}
                            </span>
                            <span className="truncate">{JSON.stringify(a.detail)}</span>
                            <span className="ml-auto shrink-0">{fmtWhen(a.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  }
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 size-6" />
                  <p>Enable a contact as a team member to see their activity here.</p>
                  <p className="mt-1 text-xs">
                    Their token is what unlocks <code>/team</code>.
                  </p>
                </div>
              </div>
            )}
          </section>
        }
      />
    </Tab>
  );
}

function TopicsTab({ topic, q: query, page }: { topic?: string; q?: string; page?: string }) {
  const qs = new URLSearchParams();
  if (topic) qs.set('topic', topic);
  if (query) qs.set('q', query);
  if (page) qs.set('page', page);
  const q = useQuery({
    queryKey: ['team-admin', 'topics', topic ?? null, query ?? null, page ?? null],
    queryFn: () => apiFetch<TopicsResponse>(`/api/team-admin/topics?${qs.toString()}`),
  });
  const data = q.data;
  const selected = data?.selected ?? null;

  // Explicit read-mark once the transcript is on screen (was an SSR render
  // side effect). Refetching the list clears the unread dot immediately.
  const refetch = q.refetch;
  useEffect(() => {
    if (!selected) return;
    void apiSend(`/api/team-admin/forum/topics/${selected.topic.id}/read`, 'POST')
      .then(() => refetch())
      .catch(() => {});
  }, [selected?.topic.id]); // eslint-disable-line react-hooks/exhaustive-deps -- fire once per topic

  if (!data)
    return (
      <Tab active="topics">
        <Loading />
      </Tab>
    );

  const uploadStates = new Map(data.selected?.uploadStates.map((u) => [u.id, u.status]) ?? []);
  const ctxQuery = query?.trim() || undefined;
  return (
    <Tab active="topics" badges={data.badges}>
      <MasterDetail
        // Its own key — see the Members tab above.
        id="team-admin-topics"
        className="min-h-0 flex-1"
        defaultListSize="340px"
        // A forum transcript is reading text: same three-panel reasoning as
        // Members — tucked left, draggable, opening at the old 3xl measure.
        defaultDetailSize="768px"
        maxDetailSize="100%"
        list={
          <>
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Forum topics</h2>
              <AdminTopicSearch initialQuery={ctxQuery ?? ''} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {data.topics.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  {ctxQuery
                    ? `No topics or posts match “${ctxQuery}”.`
                    : 'No forum topics yet. Members start them at /team/forum — pinned topics float to the top of everyone’s list.'}
                </div>
              ) : (
                <ul className="flex flex-col gap-2 p-3">
                  {data.topics.map((t) => {
                    const ctx =
                      `${ctxQuery ? `&q=${encodeURIComponent(ctxQuery)}` : ''}` +
                      `${data.page > 1 ? `&page=${data.page}` : ''}`;
                    return (
                      <li key={t.id}>
                        <ListCard asChild selected={t.id === selected?.topic.id}>
                          <Link href={`/team-admin?view=topics&topic=${t.id}${ctx}`}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                {t.unread > 0 ? (
                                  <span
                                    className="size-2 shrink-0 rounded-full bg-primary"
                                    aria-hidden
                                  />
                                ) : null}
                                <ListCardTitle>{t.title}</ListCardTitle>
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {fmtWhen(t.lastPostAt)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <TopicFlags
                                pinned={t.pinned}
                                visibility={t.visibility}
                                status={t.status}
                              />
                              <KindBadge kind={t.kind} />
                              <span className="min-w-0 truncate">
                                {t.authorName} · {t.postCount}{' '}
                                {t.postCount === 1 ? 'post' : 'posts'}
                              </span>
                            </div>
                          </Link>
                        </ListCard>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <AdminTopicPager page={data.page} total={data.topicTotal} pageSize={data.pageSize} />
          </>
        }
        detail={
          <section className="flex h-full min-h-0 flex-col">
            {selected ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{selected.topic.title}</h2>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TopicFlags
                        pinned={selected.topic.pinned}
                        visibility={selected.topic.visibility}
                        status={selected.topic.status}
                      />
                      <KindBadge kind={selected.topic.kind} />
                      <span>
                        started by {selected.topic.authorName} · {fmtWhen(selected.topic.createdAt)}
                      </span>
                    </p>
                  </div>
                  <TopicPinToggle
                    topicId={selected.topic.id}
                    pinned={selected.topic.pinned}
                    onDone={() => void refetch()}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
                  <div className="flex w-full flex-col gap-3">
                    {selected.posts.map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2',
                          p.authorKind === 'member'
                            ? 'border-primary/20 bg-primary/5'
                            : 'border-border bg-card text-card-foreground',
                        )}
                      >
                        <div className="mb-1 flex items-baseline gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{p.authorName}</span>
                          {p.authorKind !== 'member' && (
                            <span className="rounded-full border border-border px-1.5 py-px text-[10px] uppercase tracking-wider">
                              {p.authorKind === 'agent' ? 'Assistant' : 'Owner'}
                            </span>
                          )}
                          <span>{fmtWhen(p.createdAt)}</span>
                          {p.traceId ? (
                            <Link
                              href={`/traces/${p.traceId}`}
                              className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:underline"
                            >
                              <ExternalLink className="size-3" /> trace
                            </Link>
                          ) : null}
                        </div>
                        {p.status === 'failed' ? (
                          <p className="text-sm text-destructive-ink">
                            Turn failed: {p.error ?? 'unknown error'}
                          </p>
                        ) : p.status === 'pending' ? (
                          <p className="text-sm italic text-muted-foreground">answering…</p>
                        ) : p.authorKind === 'member' ? (
                          <p className="whitespace-pre-wrap text-sm">{p.body}</p>
                        ) : (
                          <div className="prose prose-accent prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
                          </div>
                        )}
                        {p.attachments.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {p.attachments.map((a) => {
                              if (!a.fileId) return null;
                              const st = uploadStates.get(a.fileId);
                              // Dismissed bytes are gone — dead chip, no link.
                              if (st === 'dismissed') {
                                return (
                                  <span
                                    key={a.fileId}
                                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground line-through"
                                    title="Dismissed — bytes deleted"
                                  >
                                    <Paperclip className="size-3" aria-hidden />
                                    {a.caption ?? 'attachment'}
                                  </span>
                                );
                              }
                              return (
                                <AdminDownloadLink
                                  key={a.fileId}
                                  path={`/api/team-admin/forum/uploads/${a.fileId}/download`}
                                >
                                  <Paperclip className="size-3" aria-hidden />
                                  {a.caption ?? 'attachment'}
                                  {st === 'filed' ? ' ✓' : ''}
                                </AdminDownloadLink>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border px-4 py-3">
                  <TopicReplyForm
                    topicId={selected.topic.id}
                    status={selected.topic.status}
                    onDone={() => void refetch()}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center text-sm text-muted-foreground">
                  <MessagesSquare className="mx-auto mb-2 size-6" />
                  <p>The team&rsquo;s shared forum threads land here.</p>
                </div>
              </div>
            )}
          </section>
        }
      />
    </Tab>
  );
}

/** What the Requests list has selected: an upload awaiting review or a change
 *  request. Client state, not URL — the one GET carries every row in full, so
 *  there is no per-item fetch to deep-link. */
type RequestSelection = { kind: 'upload' | 'request'; id: string } | null;

function RequestsTab() {
  const q = useQuery({
    queryKey: ['team-admin', 'requests'],
    queryFn: () => apiFetch<RequestsResponse>('/api/team-admin/requests'),
  });
  const data = q.data;
  const [sel, setSel] = useState<RequestSelection>(null);

  // Auto-select the first row (uploads first, matching the list order), and
  // re-select when the current row disappears — a cleared upload or a filtered
  // refetch must not leave a detail pane showing a ghost.
  useEffect(() => {
    if (!data) return;
    const stillThere =
      sel &&
      (sel.kind === 'upload'
        ? data.uploads.some((u) => u.id === sel.id)
        : data.requests.some((r) => r.taskId === sel.id));
    if (stillThere) return;
    setSel(
      data.uploads[0]
        ? { kind: 'upload', id: data.uploads[0].id }
        : data.requests[0]
          ? { kind: 'request', id: data.requests[0].taskId }
          : null,
    );
  }, [data, sel]);

  if (!data)
    return (
      <Tab active="requests">
        <Loading />
      </Tab>
    );
  const refetch = () => void q.refetch();

  if (data.requests.length === 0 && data.uploads.length === 0) {
    return (
      <Tab active="requests" badges={data.badges}>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center text-sm text-muted-foreground">
            <Inbox className="mx-auto mb-2 size-6" />
            <p>No change requests or uploads yet. When a team member asks for content to be</p>
            <p>updated or attaches a file, it lands here for a specialist to review.</p>
          </div>
        </div>
      </Tab>
    );
  }

  const selUpload =
    sel?.kind === 'upload' ? (data.uploads.find((u) => u.id === sel.id) ?? null) : null;
  const selRequest =
    sel?.kind === 'request' ? (data.requests.find((r) => r.taskId === sel.id) ?? null) : null;

  return (
    <Tab active="requests" badges={data.badges}>
      <MasterDetail
        id="team-admin-requests"
        className="min-h-0 flex-1"
        defaultListSize="340px"
        maxDetailSize="100%"
        list={
          <>
            <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Requests</h2>
              <span className="text-xs text-muted-foreground">
                {data.requests.length + data.uploads.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <div className="space-y-4 p-3">
                {data.uploads.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Paperclip className="size-3.5" aria-hidden />
                      Uploads awaiting review
                    </h3>
                    {data.moreUploads > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Showing the {data.uploads.length} longest-waiting — {data.moreUploads} more
                        appear as you clear these.
                      </p>
                    )}
                    <ul className="flex flex-col gap-2">
                      {data.uploads.map((u) => (
                        <li key={u.id}>
                          <ListCard
                            selected={sel?.kind === 'upload' && sel.id === u.id}
                            onClick={() => setSel({ kind: 'upload', id: u.id })}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <ListCardTitle>{u.filename}</ListCardTitle>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {fmtWhen(u.createdAt)}
                              </span>
                            </div>
                            <ListCardMeta>
                              from {u.contactName ?? 'a team member'} · {formatSize(u.sizeBytes)}
                            </ListCardMeta>
                          </ListCard>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {data.requests.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Change requests
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {data.requests.map((r) => (
                        <li key={r.taskId}>
                          <ListCard
                            selected={sel?.kind === 'request' && sel.id === r.taskId}
                            dimmed={r.status === 'done'}
                            onClick={() => setSel({ kind: 'request', id: r.taskId })}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <ListCardTitle>{r.title}</ListCardTitle>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {fmtWhen(r.createdAt)}
                              </span>
                            </div>
                            <ListCardMeta>
                              from {r.contactName ?? 'a team member'} ·{' '}
                              {r.status === 'done' ? 'done' : r.notifiedAt ? 'replied' : 'open'}
                            </ListCardMeta>
                          </ListCard>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          </>
        }
        detail={
          <section className="flex h-full min-h-0 flex-col">
            {selRequest ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{selRequest.title}</span>
                      <RequestStatusPill done={selRequest.status === 'done'} />
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      from {selRequest.contactName ?? 'a team member'} ·{' '}
                      {new Date(selRequest.createdAt).toLocaleDateString()}
                      {selRequest.notifiedAt ? ' · replied' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs">
                    <Link
                      href={`/tasks?selected=${selRequest.taskId}`}
                      className="text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Open task →
                    </Link>
                    {selRequest.contactId ? (
                      <Link
                        href={`/team-admin?contact=${selRequest.contactId}`}
                        className="text-muted-foreground underline-offset-2 hover:underline"
                      >
                        View their chat →
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                  <div className="w-full space-y-2 p-4">
                    {selRequest.body ? (
                      <div className="prose prose-accent prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selRequest.body}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No further detail — the title is the whole request.
                      </p>
                    )}
                    {selRequest.contactId ? (
                      <RequestReply
                        key={selRequest.taskId}
                        taskId={selRequest.taskId}
                        contactName={selRequest.contactName}
                        done={selRequest.status === 'done'}
                        onDone={refetch}
                      />
                    ) : null}
                  </div>
                </div>
              </>
            ) : selUpload ? (
              <>
                <div className="border-b border-border px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Paperclip className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{selUpload.filename}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    from {selUpload.contactName ?? 'a team member'} ·{' '}
                    {formatSize(selUpload.sizeBytes)} · {fmtWhen(selUpload.createdAt)}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                  <div className="w-full space-y-3 p-4">
                    {selUpload.topicId ? (
                      <p className="text-sm">
                        Posted in{' '}
                        <Link
                          href={`/team-admin?view=topics&topic=${selUpload.topicId}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {selUpload.topicTitle ?? 'Untitled topic'} →
                        </Link>
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Files stay out of the brain until you move them to files/review.
                    </p>
                    <UploadReviewActions
                      uploadId={selUpload.id}
                      filename={selUpload.filename}
                      onDone={refetch}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 size-6" />
                  <p>Select a request or upload to review it here.</p>
                </div>
              </div>
            )}
          </section>
        }
      />
    </Tab>
  );
}

function SharesTab() {
  const q = useQuery({
    queryKey: ['team-admin', 'shares'],
    queryFn: () => apiFetch<SharesResponse>('/api/team-admin/shares'),
  });
  if (!q.data)
    return (
      <Tab active="shares">
        <Loading />
      </Tab>
    );
  return (
    <Tab active="shares" badges={q.data.badges}>
      <SharedLinksPanel initial={q.data.shares} />
    </Tab>
  );
}

function SettingsTab() {
  const q = useQuery({
    queryKey: ['team-admin', 'settings'],
    queryFn: () => apiFetch<SettingsResponse>('/api/team-admin/settings'),
  });
  const data = q.data;
  if (!data)
    return (
      <Tab active="settings">
        <Loading />
      </Tab>
    );
  return (
    <Tab active="settings" badges={data.badges}>
      {/* No list behind these three cards, so no MasterDetail — the settings-hub
          pattern instead: one measured column with a draggable right edge,
          tucked left, remembered per screen (see settings/(hub)/layout.tsx). */}
      <div className="min-h-0 flex-1">
        <MeasuredPane id="team-admin-settings">
          <div className="w-full space-y-4 p-4">
            <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <h2 className="text-sm font-semibold">Read posture</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                Members always get brain-knowledge reads. This gates your PRIVATE corpus (email and
                journal) for every team surface — the Forum included. Default off.
              </p>
              <PrivateReadsToggle initial={data.privateReads} />
            </div>

            {/* Keyed by the current designation so a server-side change (another
              tab, MCP) resyncs the Select on refetch. */}
            <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <h2 className="text-sm font-semibold">Hub app</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                Which published app renders full-bleed at <code>/hub</code> for members. The
                built-in briefing hub is the fallback.
              </p>
              <HubAppPicker
                key={data.hubAppId ?? 'builtin'}
                currentAppId={data.hubAppId}
                apps={data.hubCandidates}
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <h2 className="text-sm font-semibold">Dashboard sections</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                Curated tag sections on the <code>/team</code> overview, drawn from your shared
                pages.
              </p>
              <DashboardTagsPanel
                key={data.dashboardTags.selected.join(',')}
                initialTags={data.dashboardTags.selected}
                available={data.dashboardTags.available}
              />
            </div>
          </div>
        </MeasuredPane>
      </div>
    </Tab>
  );
}

export default function TeamAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    contact?: string;
    view?: string;
    topic?: string;
    q?: string;
    page?: string;
    /** Activity-feed page on the Members tab — deliberately not `page`, so the
     *  two tabs' pagers never read each other's cursor. */
    apage?: string;
  }>;
}) {
  const { contact, view, topic, q, page, apage } = use(searchParams);
  if (view === 'settings') return <SettingsTab />;
  if (view === 'shares') return <SharesTab />;
  if (view === 'topics') return <TopicsTab topic={topic} q={q} page={page} />;
  if (view === 'requests') return <RequestsTab />;
  return <MembersTab contact={contact} apage={apage} />;
}
