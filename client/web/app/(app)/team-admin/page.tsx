'use client';

/**
 * /team-admin — the owner's window into the external team surface.
 *
 * Tabs: Chat archive · Invites · Member chats · Review · Requests ·
 * Shared links · Clients · What clients see · Settings. Clients = client
 * logins, each signed in with a link issued here (client logins C2). What
 * clients see = every item at client level, which every client login will
 * read, and the admin's "I have checked this list" (client logins C1). Invites = member invites (member logins Phase 6):
 * an invite link makes a member login, for a contact or anyone by email.
 * Review = member items submitted for review, and what deactivated logins
 * left shared (member logins Phase 4). Chat archive = every contact with old
 * team portal chat, newest first, read only, each with "Invite as member".
 * Team codes are gone (brain migration 0178 dropped them; only an invite code
 * redeems now), so a row's "first message" is its first portal message and
 * there is no "code last used". Member chats = member LOGINS' chats with the
 * team agent (users are the team).
 *
 * The team portal (/team, /hub) and its forum are retired (member logins
 * Phase 6): the Topics tab, the forum columns and the upload queue went with
 * them. The forum's tables are dropped (brain migration 0177) and nothing on
 * this page offers an export any more; the forum's content lives on as the
 * admin-level Forum archive pages. These routes no longer answer any forum
 * or upload parts, and every tab's `badges` is `{ openRequestCount }`.
 *
 * Data arrives per tab from GET /api/team-admin/{members,member-chats,
 * requests,shares,settings} via apiFetch (owner bearer cross-origin, cookie
 * same-origin); this app is zero-secret and reads no DB. URL-driven
 * (?view/contact/login/item), so deep links keep working. Chat archive keeps
 * the old Code holders URL (/team-admin, ?contact=), and an old ?view=topics
 * link lands on it too.
 */
import { useNeedsYou } from '@/components/needs-you/use-needs-you';
import { requestsOpen, reviewWaiting } from '@/lib/needs-you';
import Link from 'next/link';
import { use, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { NO_IMAGES } from '@mantle/web-ui/comment-thread';
import { useToast } from '@mantle/web-ui/ui/toast';
import type { TeamMemberActivity, MemberChatPortalThread } from '@mantle/client-types';
// The C4 request shape (fromClient): drop to '@mantle/client-types' with the shim.
import type { TeamRequest } from '@mantle/client-types';
import type { MemberChatsResponse } from '@mantle/client-types';
import {
  CHAT_ROSTER_FILTERS,
  chatRosterEmptyText,
  chatRosterTag,
  chatRowMetaTag,
  filterChatRoster,
  isClientChat,
  type ChatRosterFilter,
} from '@/lib/member-chats-roster';
import {
  SHARES_KEY,
  SharedLinksPanel,
  type SharedLinkRow,
} from '@/components/share/shared-links-panel';
import type { RetiredClientLinkRow } from '@mantle/client-types';
import { retiredLinksOf } from '@/lib/shared-links';
import { HubAppPicker } from '@/components/team-chat/hub-app-picker';
import { PrivateReadsToggle } from '@/components/team-chat/private-reads-toggle';
import { RequestReply } from '@/components/team-chat/request-reply';
import { ThreadAccessSplit } from '@/components/team-chat/access-split';
import {
  Archive,
  MessagesSquare,
  ExternalLink,
  Inbox,
  CheckCircle2,
  Loader2,
  Users,
} from 'lucide-react';
import { InviteMemberButton, InvitesPanel } from '@/components/team-admin/member-invites';
import { ReviewPanel, useReviewQueue } from '@/components/team-admin/review-tab';
import { ClientReportPanel } from '@/components/team-admin/client-report';
import { ClientLoginsPanel } from '@/components/team-admin/client-logins';
import {
  CLIENT_REPORT_KEY,
  NOT_ON_THIS_BRAIN,
  fetchClientReport,
  isReportMissing,
} from '@/lib/client-report';
import { portalAtStart, portalCursor, prependOlder } from '@/lib/portal-thread';
import {
  canReplyToRequest,
  isClientRequest,
  requestChatHref,
  requestFromText,
} from '@/lib/team-requests';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@mantle/web-ui/ui/tabs';
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

type Badges = { openRequestCount: number };

type MemberRow = TeamMemberActivity;

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
    requests: TeamRequest[];
    thread: ArchiveMessage[];
    access: AccessRow[];
  } | null;
};

type RequestsResponse = { badges: Badges; requests: TeamRequest[] };

/** `retired`: the old client links the brain retired (client logins C3);
 *  absent from a brain before C3, which reads as none. */
type SharesResponse = {
  badges: Badges;
  shares: SharedLinkRow[];
  retired?: RetiredClientLinkRow[];
};

type SettingsResponse = {
  badges: Badges;
  privateReads: boolean;
  hubAppId: string | null;
  hubCandidates: Array<{ id: string; title: string }>;
};

// ── Shared pieces (carried over from the SSR page) ──────────────────────────

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

/** A tab whose first load failed: says so, with Retry (the Invites and
 *  Review tabs' block). Without it a 403, a 500 or a dropped network left
 *  "Loading…" up for ever: these queries retry once and never refetch on
 *  focus. */
function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm">
      <p className="text-muted-foreground">Could not load {what}.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** What a tab shows before its data: Loading, or the error with Retry. */
function TabPending({
  active,
  query,
  what,
}: {
  active: Parameters<typeof TeamTabs>[0]['active'];
  query: { isError: boolean; refetch: () => unknown };
  what: string;
}) {
  return (
    <Tab active={active}>
      {query.isError ? <LoadError what={what} onRetry={() => void query.refetch()} /> : <Loading />}
    </Tab>
  );
}

function TeamTabs({
  active,
  openRequestCount,
}: {
  active:
    | 'members'
    | 'invites'
    | 'chats'
    | 'review'
    | 'requests'
    | 'shares'
    | 'client-logins'
    | 'clients'
    | 'settings';
  openRequestCount: number;
}) {
  // The brain's live counts (the same numbers as the rail notice), so every
  // tab shows both badges; the queue and this tab's own answer stand in
  // until they load, or on a brain that predates the count.
  // Waiting items only: what deactivated logins left behind is not urgent.
  const needsYou = useNeedsYou();
  const queued = useReviewQueue().data?.counts.submitted ?? 0;
  const reviewCount = needsYou ? reviewWaiting(needsYou) : queued;
  const requestCount = needsYou ? requestsOpen(needsYou) : openRequestCount;
  // A brain before client logins C1 has no "What clients see": once its
  // route answered 404 the tab leaves the strip (it stays while open).
  const reportMissing = isReportMissing(useQueryClient().getQueryState(CLIENT_REPORT_KEY)?.error);
  const tab = (label: string, href: string, isActive: boolean, badge?: number) => (
    <Link
      href={href}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
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
    // A labelled `nav`, not a bare div: these tabs are navigation, and the name
    // is what tells "Settings the tab" apart from "Settings the sidebar row"
    // now that the sidebar has one. Screen readers get the same benefit.
    // Nine tabs are wider than a phone: the strip scrolls sideways (thin
    // scrollbar, like every scroller) instead of pushing the page wider.
    <nav
      aria-label="Team admin"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3 scrollbar-thin"
    >
      {tab('Chat archive', '/team-admin', active === 'members')}
      {tab('Invites', '/team-admin?view=invites', active === 'invites')}
      {tab('Member chats', '/team-admin?view=chats', active === 'chats')}
      {tab('Review', '/team-admin?view=review', active === 'review', reviewCount)}
      {tab('Requests', '/team-admin?view=requests', active === 'requests', requestCount)}
      {tab('Shared links', '/team-admin?view=shares', active === 'shares')}
      {tab('Clients', '/team-admin?view=client-logins', active === 'client-logins')}
      {reportMissing && active !== 'clients'
        ? null
        : tab('What clients see', '/team-admin?view=clients', active === 'clients')}
      {tab('Settings', '/team-admin?view=settings', active === 'settings')}
    </nav>
  );
}

function MemberList({ members, selectedId }: { members: MemberRow[]; selectedId: string | null }) {
  if (members.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No contact has old portal chat. Invite new people from{' '}
        <Link href="/team-admin?view=invites" className="underline">
          Invites
        </Link>
        .
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
                {m.lastMessageAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtWhen(m.lastMessageAt)}
                  </span>
                ) : null}
              </div>
              <ListCardMeta>
                {m.lastMessageText ?? `first message ${fmtWhen(m.memberSince)}`}
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

/** A chat thread, oldest first: the member's messages on the right, the
 *  agent's replies (with a trace link) on the left. A reply draws no
 *  picture (client tier audit U5): a client can talk the agent into writing
 *  one, and it would load in the admin's browser. */
function ThreadMessages({ thread }: { thread: ArchiveMessage[] }) {
  return (
    <>
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
            ) : m.status === 'pending' ? (
              <p className="text-sm italic text-muted-foreground">answering…</p>
            ) : (
              <div className="prose prose-accent prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={NO_IMAGES}>
                  {m.text}
                </ReactMarkdown>
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
    </>
  );
}

function ChatArchive({ thread, count }: { thread: ArchiveMessage[]; count: number }) {
  return (
    <details className="rounded-lg border border-border bg-card text-card-foreground">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <Archive className="size-3.5" aria-hidden />
        Chat archive ({count} {count === 1 ? 'message' : 'messages'})
        <span className="font-normal">· the old 1:1 team portal chat</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border/60 px-3 py-3">
        {thread.length < count && (
          <p className="text-center text-xs text-muted-foreground">
            Showing the latest {thread.length} of {count}.
          </p>
        )}
        <ThreadMessages thread={thread} />
      </div>
    </details>
  );
}

/**
 * A member login's OLD team portal chat (member logins Phase 6): the thread
 * its contact had on the team portal before the invite. History for the admin
 * only, so it sits in its own labelled, collapsed, read-only section and is
 * never merged into the member's thread. "Load older" pages it with
 * ?portalBefore=; a short window is the start.
 */
function PortalThread({ loginId, portal }: { loginId: string; portal: MemberChatPortalThread }) {
  const [thread, setThread] = useState(portal.thread);
  const [atStart, setAtStart] = useState(() => portalAtStart(portal.thread, portal.windowSize));
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const loadOlder = async () => {
    const cursor = portalCursor(thread);
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ login: loginId, portalBefore: cursor });
      const res = await apiFetch<MemberChatsResponse>(`/api/team-admin/member-chats?${qs}`);
      const page = res.selected?.portalThread;
      const older = page?.thread ?? [];
      setThread((shown) => prependOlder(older, shown));
      setAtStart(portalAtStart(older, page?.windowSize ?? portal.windowSize));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load older messages');
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="rounded-lg border border-border bg-card text-card-foreground">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <Archive className="size-3.5" aria-hidden />
        Earlier team chat (before their member login)
        <span className="font-normal">· read only</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border/60 px-3 py-3">
        <p className="text-xs text-muted-foreground">
          Their chat on the old team portal. The member does not see it here, and the agent does not
          read it.
        </p>
        {!atStart && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center text-muted-foreground"
            disabled={loading}
            onClick={() => void loadOlder()}
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            Load older
          </Button>
        )}
        {thread.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">No messages.</p>
        ) : (
          <ThreadMessages thread={thread} />
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

function MembersTab({ contact }: { contact?: string }) {
  const qs = new URLSearchParams();
  if (contact) qs.set('contact', contact);
  const q = useQuery({
    queryKey: ['team-admin', 'members', contact ?? null],
    queryFn: () => apiFetch<MembersResponse>(`/api/team-admin/members?${qs.toString()}`),
  });
  const data = q.data;
  const selected = data?.selected ?? null;
  const selectedMember = selected
    ? (data?.members.find((m) => m.contactId === selected.contactId) ?? null)
    : null;

  if (!data) return <TabPending active="members" query={q} what="the chat archive" />;

  return (
    <Tab active="members" badges={data.badges}>
      <MasterDetail
        // Its OWN key, not one shared with Member chats: the two tabs list
        // different things at different lengths, so a width dragged for one
        // has no business setting the other's.
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
              <h2 className="text-sm font-semibold">Chat archive</h2>
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
                      first message {fmtWhen(selectedMember.memberSince)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/contacts?selected=${selectedMember.contactId}`}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Contact →
                    </Link>
                    <InviteMemberButton
                      contactId={selectedMember.contactId}
                      name={selectedMember.contactName}
                    />
                  </div>
                </div>
                <ThreadAccessSplit
                  thread={
                    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                      <div className="w-full space-y-5 p-4">
                        {selected.requests.length > 0 && (
                          <MemberRequestList requests={selected.requests} />
                        )}
                        {selected.requests.length === 0 && selectedMember.messageCount === 0 && (
                          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                            {selectedMember.contactName} filed no requests and has no chat archive.
                          </p>
                        )}
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
                  {data.members.length === 0 ? (
                    <>
                      <p>No contact has old portal chat.</p>
                      <p className="mt-1 text-xs">Invite new people from the Invites tab.</p>
                    </>
                  ) : (
                    <p>Select a contact to read their old portal chat.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        }
      />
    </Tab>
  );
}

function MemberChatsTab({ login }: { login?: string }) {
  const qs = new URLSearchParams();
  if (login) qs.set('login', login);
  const q = useQuery({
    queryKey: ['team-admin', 'member-chats', login ?? null],
    queryFn: () => apiFetch<MemberChatsResponse>(`/api/team-admin/member-chats?${qs.toString()}`),
  });
  // Local, not URL: a row link changes ?login=, and the filter holds.
  const [filter, setFilter] = useState<ChatRosterFilter>('all');
  const data = q.data;
  if (!data) return <TabPending active="chats" query={q} what="member chats" />;
  const rows = filterChatRoster(data.members, filter);
  const selected = data.selected;
  const member = selected
    ? (data.members.find((m) => m.loginId === selected.loginId) ?? null)
    : null;
  const rosterTag = member ? chatRosterTag(member) : null;
  return (
    <Tab active="chats">
      <MasterDetail
        id="team-admin-member-chats"
        className="min-h-0 flex-1"
        defaultListSize="340px"
        defaultDetailSize="768px"
        maxDetailSize="100%"
        list={
          <>
            <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Member chats</h2>
              {data.members.length > 0 && (
                <span className="text-xs text-muted-foreground">{data.members.length}</span>
              )}
            </div>
            {data.members.length > 0 && (
              <div className="border-b border-border p-3">
                <Tabs value={filter} onValueChange={(v) => setFilter(v as ChatRosterFilter)}>
                  <TabsList className="w-full" aria-label="Show">
                    {CHAT_ROSTER_FILTERS.map((f) => (
                      <TabsTrigger key={f.value} value={f.value} className="flex-1">
                        {f.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {data.members.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No member logins yet. Add one in{' '}
                  <Link href="/settings/users" className="underline">
                    Settings &gt; Users
                  </Link>
                  .
                </div>
              ) : rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{chatRosterEmptyText(filter)}</p>
              ) : (
                <ul className="flex flex-col gap-2 p-3">
                  {rows.map((m) => (
                    <li key={m.loginId}>
                      <ListCard asChild selected={m.loginId === selected?.loginId}>
                        <Link href={`/team-admin?view=chats&login=${m.loginId}`}>
                          <div className="flex items-baseline justify-between gap-2">
                            <ListCardTitle>{m.name}</ListCardTitle>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {fmtWhen(m.lastMessageAt)}
                            </span>
                          </div>
                          <ListCardMeta>
                            {/* On the meta line, so the name keeps the width. */}
                            {isClientChat(m) ? (
                              <Badge variant="outline" className="mr-1.5 px-1.5 py-0">
                                Client
                              </Badge>
                            ) : null}
                            {chatRowMetaTag(m) ? `${chatRowMetaTag(m)} · ` : ''}
                            {m.lastMessageText ? m.lastMessageText : `${m.email} · no messages yet`}
                          </ListCardMeta>
                        </Link>
                      </ListCard>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        }
        detail={
          <section className="flex h-full min-h-0 flex-col">
            {selected && member ? (
              <>
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold">{member.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {member.email} · {member.messageCount}{' '}
                    {member.messageCount === 1 ? 'message' : 'messages'}
                    {rosterTag ? ` · ${rosterTag}` : ''}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                  <div className="flex w-full flex-col gap-3 p-4">
                    {selected.portalThread && (
                      <PortalThread
                        // A fresh section (and paging state) per login.
                        key={`${selected.loginId}:${selected.portalThread.contactId}`}
                        loginId={selected.loginId}
                        portal={selected.portalThread}
                      />
                    )}
                    {selected.thread.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                        {member.name} has not chatted yet.
                      </p>
                    ) : (
                      <>
                        {member.messageCount > selected.thread.length && (
                          <p className="text-center text-xs text-muted-foreground">
                            Showing the latest {selected.thread.length} of {member.messageCount}.
                          </p>
                        )}
                        <ThreadMessages thread={selected.thread} />
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center text-sm text-muted-foreground">
                  <MessagesSquare className="mx-auto mb-2 size-6" />
                  <p>A member&rsquo;s chat with the team agent shows here.</p>
                </div>
              </div>
            )}
          </section>
        }
      />
    </Tab>
  );
}

function RequestsTab() {
  const q = useQuery({
    queryKey: ['team-admin', 'requests'],
    queryFn: () => apiFetch<RequestsResponse>('/api/team-admin/requests'),
  });
  const data = q.data;
  // Client state, not URL: the one GET carries every row in full, so there is
  // no per-item fetch to deep-link. Falls back to the first row, so a request
  // that leaves the list never leaves a ghost in the detail pane.
  const [selId, setSelId] = useState<string | null>(null);

  if (!data) return <TabPending active="requests" query={q} what="the requests" />;
  const refetch = () => void q.refetch();

  if (data.requests.length === 0) {
    return (
      <Tab active="requests" badges={data.badges}>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center text-sm text-muted-foreground">
            <Inbox className="mx-auto mb-2 size-6" />
            <p>No change requests yet. When a team member asks for content to be updated,</p>
            <p>it lands here for a specialist to review.</p>
          </div>
        </div>
      </Tab>
    );
  }

  const selRequest = data.requests.find((r) => r.taskId === selId) ?? data.requests[0] ?? null;
  // A member login's request has no contact: its chat and the reply are the
  // login's (lib/team-requests.ts).
  const chatHref = selRequest ? requestChatHref(selRequest) : null;

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
              <h2 className="text-sm font-semibold">Change requests</h2>
              <span className="text-xs text-muted-foreground">{data.requests.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <ul className="flex flex-col gap-2 p-3">
                {data.requests.map((r) => (
                  <li key={r.taskId}>
                    <ListCard
                      selected={r.taskId === selRequest?.taskId}
                      dimmed={r.status === 'done'}
                      onClick={() => setSelId(r.taskId)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <ListCardTitle className="min-w-0">{r.title}</ListCardTitle>
                          {isClientRequest(r) ? (
                            <Badge variant="outline" className="shrink-0">
                              Client
                            </Badge>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtWhen(r.createdAt)}
                        </span>
                      </div>
                      <ListCardMeta>
                        from {requestFromText(r)} ·{' '}
                        {r.status === 'done' ? 'done' : r.notifiedAt ? 'replied' : 'open'}
                      </ListCardMeta>
                    </ListCard>
                  </li>
                ))}
              </ul>
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
                      {isClientRequest(selRequest) ? (
                        <Badge variant="outline" className="shrink-0">
                          Client
                        </Badge>
                      ) : null}
                      <RequestStatusPill done={selRequest.status === 'done'} />
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      from {requestFromText(selRequest)} ·{' '}
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
                    {chatHref ? (
                      <Link
                        href={chatHref}
                        className="text-muted-foreground underline-offset-2 hover:underline"
                      >
                        View their chat →
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                  <div className="w-full space-y-2 p-4">
                    {/* A request body is the requester's words: no picture
                        loads from it (client tier audit U5). */}
                    {selRequest.body ? (
                      <div className="prose prose-accent prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={NO_IMAGES}>
                          {selRequest.body}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No further detail — the title is the whole request.
                      </p>
                    )}
                    {canReplyToRequest(selRequest) ? (
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
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 size-6" />
                  <p>Select a request to review it here.</p>
                </div>
              </div>
            )}
          </section>
        }
      />
    </Tab>
  );
}

function SharesTab({ share }: { share?: string }) {
  const q = useQuery({
    queryKey: SHARES_KEY,
    queryFn: () => apiFetch<SharesResponse>('/api/team-admin/shares'),
  });
  if (!q.data) return <TabPending active="shares" query={q} what="shared links" />;
  return (
    <Tab active="shares" badges={q.data.badges}>
      <SharedLinksPanel
        rows={q.data.shares}
        retired={retiredLinksOf(q.data)}
        initialSelectedId={share}
      />
    </Tab>
  );
}

/** What clients see (client logins C1): one measured column, like Settings. */
function ClientsTab() {
  const q = useQuery({
    queryKey: CLIENT_REPORT_KEY,
    queryFn: fetchClientReport,
    // A 404 is a brain without the report, not a hiccup: no retry.
    retry: (count, err) => !isReportMissing(err) && count < 1,
  });
  if (!q.data && isReportMissing(q.error)) {
    return (
      <Tab active="clients">
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">{NOT_ON_THIS_BRAIN}</p>
        </div>
      </Tab>
    );
  }
  if (!q.data) return <TabPending active="clients" query={q} what="the client list" />;
  return (
    <Tab active="clients">
      <div className="min-h-0 flex-1">
        <MeasuredPane id="team-admin-clients">
          <ClientReportPanel report={q.data} />
        </MeasuredPane>
      </div>
    </Tab>
  );
}

function SettingsTab() {
  const q = useQuery({
    queryKey: ['team-admin', 'settings'],
    queryFn: () => apiFetch<SettingsResponse>('/api/team-admin/settings'),
  });
  const data = q.data;
  if (!data) return <TabPending active="settings" query={q} what="the settings" />;
  return (
    <Tab active="settings" badges={data.badges}>
      {/* No list behind these cards, so no MasterDetail: the settings-hub
          pattern instead: one measured column with a draggable right edge,
          tucked left, remembered per screen (see settings/(hub)/layout.tsx). */}
      <div className="min-h-0 flex-1">
        <MeasuredPane id="team-admin-settings">
          <div className="w-full space-y-4 p-4">
            <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <h2 className="text-sm font-semibold">Read posture</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                Members always get brain-knowledge reads. This gates your PRIVATE corpus (email and
                journal) when the team agent answers a member. Default off.
              </p>
              <PrivateReadsToggle initial={data.privateReads} />
            </div>

            {/* Keyed by the current designation so a server-side change (another
              tab, MCP) resyncs the Select on refetch. */}
            <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <h2 className="text-sm font-semibold">Member home app</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                Which published app a member login sees as their home. The built-in member home is
                the fallback.
              </p>
              <HubAppPicker
                key={data.hubAppId ?? 'builtin'}
                currentAppId={data.hubAppId}
                apps={data.hubCandidates}
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
    /** The selected login on the Member chats tab. */
    login?: string;
    /** The selected item on the Review tab. */
    item?: string;
    /** The selected link on the Shared links tab. */
    share?: string;
  }>;
}) {
  const { contact, view, login, item, share } = use(searchParams);
  if (view === 'chats') return <MemberChatsTab login={login} />;
  if (view === 'invites')
    return (
      <Tab active="invites">
        {/* One measured column, like Settings: a list with no detail pane. */}
        <div className="min-h-0 flex-1">
          <MeasuredPane id="team-admin-invites">
            <InvitesPanel />
          </MeasuredPane>
        </div>
      </Tab>
    );
  if (view === 'review')
    return (
      <Tab active="review">
        <ReviewPanel itemId={item} />
      </Tab>
    );
  if (view === 'settings') return <SettingsTab />;
  if (view === 'shares') return <SharesTab share={share} />;
  if (view === 'clients') return <ClientsTab />;
  if (view === 'client-logins')
    return (
      <Tab active="client-logins">
        {/* One measured column, like Invites: a list with no detail pane. */}
        <div className="min-h-0 flex-1">
          <MeasuredPane id="team-admin-client-logins">
            <ClientLoginsPanel />
          </MeasuredPane>
        </div>
      </Tab>
    );
  if (view === 'requests') return <RequestsTab />;
  return <MembersTab contact={contact} />;
}
