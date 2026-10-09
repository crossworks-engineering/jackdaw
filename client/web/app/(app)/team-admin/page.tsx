'use client';

/**
 * /team-admin: the owner's window into the external team surface, shrinking
 * (2026-10-09: Team admin dissolves in parts; approvals and member management
 * move to where they belong).
 *
 * Tabs: Requests · Shared links · Settings. Requests (the landing tab) =
 * change requests filed through the team agent. Settings = Member chat (the team agent's level), the read
 * posture and the member home app.
 *
 * Moved to Settings > Logins (part 1): Invites, Member chats (a login's Chat
 * view), Clients and What clients see. Their old links (?view=invites,
 * chats, client-logins, clients) are sent there (lib/logins-nav.ts), and the
 * brain routes behind them are unchanged. Chat archive (the retired team
 * portal's read-only chat) was removed: its old URL (?contact=) and an old
 * ?view=topics land on Requests. App review and Member apps moved to Apps.
 *
 * Moved into each workspace (part 2): Review. A member's submitted page,
 * note, table, drawing or file waits in its own screen under "Waiting for
 * approval"; the strip only links "N waiting in Pages" and so on, and an
 * old ?view=review[&item=] link lands on the item there (/review).
 *
 * Data arrives per tab from GET /api/team-admin/{requests,shares,settings}
 * via apiFetch (owner bearer cross-origin, cookie
 * same-origin); this app is zero-secret and reads no DB. URL-driven
 * (?view/item/share), so deep links keep working.
 */
import { useNeedsYou } from '@/components/needs-you/use-needs-you';
import { useMemberAppsForReview } from '@/components/app-nav/member-apps-review';
import { waitingInAppsLabel } from '@/lib/space-apps';
import { requestsOpen } from '@/lib/needs-you';
import { waitingByWorkspace } from '@/lib/workspace-review';
import { movedTeamAdminHref } from '@/lib/logins-nav';
import Link from 'next/link';
import { use, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { NO_IMAGES } from '@mantle/web-ui/no-images';
// The C4 request shape (fromClient): drop to '@mantle/client-types' with the shim.
import type { TeamRequest } from '@mantle/client-types';
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
import { Inbox, CheckCircle2 } from 'lucide-react';
import { TeamAgentAccessCard } from '@/components/team-admin/team-agent-access';
import type { TeamAgentAccess } from '@/lib/team-agent-access';
import { useReviewQueue } from '@/components/review/item-review';
import { ReviewRedirect } from '@/components/review/review-redirect';
import {
  canReplyToRequest,
  isClientRequest,
  requestChatHref,
  requestFromText,
} from '@/lib/team-requests';
import { Badge } from '@mantle/web-ui/ui/badge';
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
  /** The team agent and its level; absent on a brain before the field. */
  teamAgent?: TeamAgentAccess | null;
};

const SETTINGS_KEY = ['team-admin', 'settings'] as const;

function useTeamSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<SettingsResponse>('/api/team-admin/settings'),
  });
}

// ── Shared pieces (carried over from the SSR page) ──────────────────────────

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

/** A tab whose first load failed: says so, with Retry. Without it a 403, a 500 or a dropped network left
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
  active: 'requests' | 'shares' | 'settings';
  openRequestCount: number;
}) {
  // The brain's live count (the same number as the rail notice); this tab's
  // own answer stands in until it loads, or on a brain that predates it.
  const needsYou = useNeedsYou();
  const requestCount = needsYou ? requestsOpen(needsYou) : openRequestCount;
  // Members' work is reviewed in its own workspace now (workspace review
  // pattern): only a link here per workspace, while something waits there.
  const appsWaiting = waitingInAppsLabel(useMemberAppsForReview().data?.waiting.length ?? 0);
  const itemsWaiting = waitingByWorkspace(useReviewQueue().data?.items);
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
    // A strip wider than a phone scrolls sideways (thin scrollbar, like every
    // scroller) instead of pushing the page wider.
    <nav
      aria-label="Team admin"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3 scrollbar-thin"
    >
      {tab('Requests', '/team-admin?view=requests', active === 'requests', requestCount)}
      {tab('Shared links', '/team-admin?view=shares', active === 'shares')}
      {tab('Settings', '/team-admin?view=settings', active === 'settings')}
      {[...(appsWaiting ? [{ label: appsWaiting, href: '/apps' }] : []), ...itemsWaiting].map(
        (w, i) => (
          <Link
            key={w.href}
            href={w.href}
            className={cn(
              'shrink-0 whitespace-nowrap px-2 py-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline',
              i === 0 && 'ml-auto',
            )}
          >
            {w.label}
          </Link>
        ),
      )}
    </nav>
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

function SettingsTab() {
  const q = useTeamSettings();
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
            <TeamAgentAccessCard agent={data.teamAgent} />

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

/** An old link to a tab that moved: replaced by its new place. */
function Moved({ href, where }: { href: string; where: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      This moved to{' '}
      <Link href={href} className="ml-1 underline">
        {where}
      </Link>
      .
    </div>
  );
}

export default function TeamAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    /** An old Member chats link's login: its Chat in Settings > Logins. */
    login?: string;
    /** The item an old Team admin > Review link named. */
    item?: string;
    /** The selected link on the Shared links tab. */
    share?: string;
  }>;
}) {
  const { view, login, item, share } = use(searchParams);
  // Invites, Member chats, Clients and What clients see moved to Settings >
  // Logins (Team admin dissolving, part 1).
  const moved = movedTeamAdminHref({ view, login });
  if (moved) return <Moved href={moved} where="Settings > Logins" />;
  // App review and Member apps moved to Apps (workspace review pattern).
  if (view === 'app-review' || view === 'member-apps') return <Moved href="/apps" where="Apps" />;
  if (view === 'settings') return <SettingsTab />;
  if (view === 'shares') return <SharesTab share={share} />;
  // Review moved into each workspace (workspace review pattern): an old
  // link lands on the item there.
  if (view === 'review') return <ReviewRedirect item={item ?? null} />;
  // Requests is the landing tab; an old Chat archive link (?contact=) or
  // ?view=topics lands here too.
  return <RequestsTab />;
}
