import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { BrowserContext } from '@playwright/test';

/**
 * An in-memory member API for the member specs: a real HTTP server in the
 * test process that answers the /api/member/* routes a member's Mine screen
 * calls, with the draft etag contract of the real ones (`if_rev` in,
 * `draft_rev` out, 409 `current_rev` on a stale etag). The owner UI runs
 * with MANTLE_SERVER_ORIGIN pointed here (playwright.member.config.ts).
 *
 * Started with `{ role: 'admin' }` it answers an ADMIN instead: the shell,
 * the Review queue and the admin's private space, enough for Take over and
 * Give back (audit F07); "What clients see" and its acknowledgement; one
 * client note's Access control with old client links (the client logins
 * audit, a brain before C3); and Shared links as a C3 brain lists them. `admin.shellFailures` makes /api/shell answer 500 that many times
 * (the Try again screen). Anything else an admin screen asks for is a 404.
 *
 * A server rather than page.route(): a write the browser starts while the tab
 * unloads (the leave flush on a reload, sent keepalive) outlives the page,
 * and Playwright's interception never sees it. A server does, as the brain
 * would.
 *
 * Admin routes a member must never call are answered the way the brain
 * answers a member (403 `member-login`) and recorded, so a spec can assert
 * that none was called.
 *
 * Started with `{ role: 'client' }` it answers a CLIENT login (client logins
 * C0): every admin and member route refuses it with 403 `client-login`, as
 * the brain does, and records the call (`clientCalls`). Since C2 it answers
 * the client routes too (/api/client/*: the shell, Shared with you, bytes)
 * and the public sign-in link route, as the brain does; `clientSession`
 * false makes every client route a 401 (an ended session). Any other role
 * is refused on the client routes (403 `admin-login` / `member-login`).
 *
 * Since C4 it answers the client's own chat (/api/client/chat: the thread,
 * and a send whose reply lands on the second ask after it, so a spec sees
 * the dock poll), and, for an admin, the clients' chat use today and the
 * Requests tab.
 *
 * Since C2b it answers the public email sign-in code routes for every role,
 * as the brain does (`clientCodes` says whether this brain sends codes; the
 * request answers every email the same; CLIENT_EMAIL_CODE for CLIENT_EMAIL
 * signs in), and, for an admin, the sign-in sender (`admin.signinSender`).
 * The UI calls them cross-origin here, so the request cookie is not
 * modelled: the brain's routes and their tests own that binding.
 */

type Doc = Record<string, unknown>;

export const MOCK_API_PORT = Number(process.env.E2E_MEMBER_API_PORT || 3912);
/** The "brain" origin the owner UI is started against. */
export const MOCK_API_ORIGIN = `http://127.0.0.1:${MOCK_API_PORT}`;
export const PAGE_ID = '11111111-1111-4111-8111-111111111111';
export const FILE_ID = '22222222-2222-4222-8222-222222222222';
export const CHILD_ID = '33333333-3333-4333-8333-333333333333';
export const DRAW_ID = '44444444-4444-4444-8444-444444444444';
export const PAGE_TITLE = 'Field notes';
/** A Library page (a brain item at the team level), not in Mine. */
export const LIBRARY_ID = '55555555-5555-4555-8555-555555555555';
export const LIBRARY_TITLE = 'Team handbook';
/** A Library NOTE, for the item links (/notes/<id>, /n/<id>). */
export const LIBRARY_NOTE_ID = '88888888-8888-4888-8888-888888888888';
export const LIBRARY_NOTE_TITLE = 'Gate codes';
/** A page this member wrote and an admin accepted into the brain at the
 *  ADMIN level: gone from Mine and from the Library, still readable by its
 *  author through /api/member/accepted. */
export const ACCEPTED_ID = '77777777-7777-4777-8777-777777777777';
export const ACCEPTED_TITLE = 'Site survey';
export const ACCEPTED_AT = '2026-09-20T10:00:00.000Z';

/** Take over (audit F07), the member's side: a page an admin took over.
 *  Mine lists it as a `with-admin` row; every route of it answers 409. */
export const TAKEN_ID = '99999999-9999-4999-8999-999999999999';
export const TAKEN_TITLE = 'Pump report';
/** A submitted page (HOLDER) that shows a draft page of the member's
 *  (BUNDLE_CHILD) inside it: the child is frozen with it (audit F04). */
export const HOLDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const HOLDER_TITLE = 'Weekly summary';
export const BUNDLE_CHILD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const BUNDLE_CHILD_TITLE = 'Pump photo notes';
/** An accepted file an admin changed after accepting it: no bytes served. */
export const CHANGED_FILE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const CHANGED_FILE_NAME = 'valve-diagram.png';

/** The admin side (`role: 'admin'`): a submitted item in the Review queue,
 *  one released back to it (its taker was deactivated), and the admin's own
 *  private page. */
export const SUBMITTED_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const SUBMITTED_TITLE = 'Crane inspection';
export const SUBMITTED_IMAGE_TITLE = 'Hook close-up';
export const RELEASED_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const RELEASED_TITLE = 'Boiler log';
export const ADMIN_OWN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
export const ADMIN_OWN_TITLE = 'My outline';
export const MEMBER_NAME = 'Mo Member';

/** A page that embeds what a member editor used to fetch from admin routes:
 *  an uploaded image, a sub-page card and a drawing. */
export const PAGE_DOC: Doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Start.' }] },
    { type: 'image', attrs: { src: `/api/files/files/${FILE_ID}?raw=1`, nodeId: FILE_ID } },
    { type: 'childPage', attrs: { pageId: CHILD_ID, title: 'A sub-page' } },
    { type: 'image', attrs: { src: null, drawId: DRAW_ID } },
  ],
};

/** What a member may call: its own routes, and the few the brain answers
 *  for every login or for nobody in particular (the public invite routes and
 *  the token sign-in among them). Everything else under /api/ is an admin
 *  route (the brain refuses a member there), recorded so a spec can assert
 *  none was called. */
const MEMBER_OK = [
  /^\/api\/member\//,
  /^\/api\/version$/,
  /^\/api\/appearance(\/|$)/,
  /^\/api\/auth\/change-password$/,
  /^\/api\/auth\/(mobile-)?logout$/,
  // What /login asks before anyone signs in.
  /^\/api\/auth\/bootstrap-state$/,
  /^\/api\/auth\/invite\//,
  /^\/api\/auth\/token$/,
  // Public: /login asks whether client sign-in codes are on (C2b).
  /^\/api\/auth\/client-code(\/verify)?$/,
];
const isAdminOnly = (path: string) =>
  path.startsWith('/api/') && !MEMBER_OK.some((re) => re.test(path));

/** What a client login may call: the client routes (C2), and what the
 *  brain answers every login or nobody in particular (the public sign-in
 *  link route among them). */
const CLIENT_OK = [
  /^\/api\/client\//,
  /^\/api\/version$/,
  /^\/api\/appearance(\/|$)/,
  /^\/api\/auth\/(mobile-)?logout$/,
  /^\/api\/auth\/bootstrap-state$/,
  /^\/api\/auth\/client-link$/,
  /^\/api\/auth\/client-code(\/verify)?$/,
];

// ── The client portal (client logins C2) ─────────────────────────────────
/** The brain's name, as the client shell brands it. */
export const CLIENT_SITE = 'Example Studio';
export const CLIENT_EMAIL = 'pat@example.invalid';
export const CLIENT_NAME = 'Pat Client';
/** The sign-in link codes: GOOD signs CLIENT_EMAIL in, RATE answers 429;
 *  any other code (or a wrong email) is the uniform 401. */
export const CLIENT_GOOD_CODE = 'GoodClientCode2345abcdEFGH';
export const CLIENT_RATE_CODE = 'RateLimitedCode2345abcdEF';
/** Shared with you: a page (with a redacted mention and link), a note and a
 *  file, newest first. */
export const SHARED_PAGE_ID = '13131313-1313-4131-8131-131313131313';
export const SHARED_PAGE_TITLE = 'Design brief';
export const SHARED_NOTE_ID = '14141414-1414-4141-8141-141414141414';
export const SHARED_NOTE_TITLE = 'Meeting notes';
export const SHARED_FILE_ID = '15151515-1515-4151-8151-151515151515';
export const SHARED_FILE_TITLE = 'Site plan.png';
export const PRIVATE_LABEL = 'Private item';
/** A summary the brain wrote from UNREDACTED text (client logins audit B1):
 *  an older brain still sends it; no client surface may show it. */
export const LEAKY_SUMMARY = 'Mentions the team page Price floor 2027';
/** A shared table (`sharedTable`), in the allowlisted shape or the whole
 *  record an older brain sends (audit B13). */
export const SHARED_TABLE_ID = '25252525-2525-4252-8252-252525252525';
export const SHARED_TABLE_TITLE = 'Price list';
export const TABLE_DESCRIPTION = 'App export of an internal app';
/** A row shared after the list first loaded (`sharedLater`, audit B27). */
export const SHARED_LATER_ID = '26262626-2626-4262-8262-262626262626';
export const SHARED_LATER_TITLE = 'Late addition';
/** The box's peer name, as /api/appearance serves it to every role: a
 *  client surface never shows it (audit B27). */
export const MOCK_PEER = 'mock-box-peer';

/** Email sign-in codes (C2b): the code the mock "mailed" CLIENT_EMAIL, and
 *  an email whose request is rate limited. */
export const CLIENT_EMAIL_CODE = '24681357';
export const CLIENT_CODE_RATE_EMAIL = 'busy@example.invalid';
export const CLIENT_CODE_NOT_VALID = 'That code did not work. Ask for a new one.';
/** The admin's sign-in sender candidates. */
export const SENDER_DESK = {
  id: '23232323-2323-4232-8232-232323232323',
  address: 'desk@example.invalid',
};
export const SENDER_INFO = {
  id: '24242424-2424-4242-8242-242424242424',
  address: 'info@example.invalid',
};

/** The admin's client logins (Team admin > Clients). */
export const CLIENT_LOGIN_ID = '16161616-1616-4161-8161-161616161616';
/** The client-level agent a client chats with (C4): a name, never a person's. */
export const CLIENT_AGENT_NAME = 'Front desk';
/** What the agent answers every client message with. */
export const CLIENT_CHAT_REPLY = 'The survey is booked for Tuesday.';
/** A Library row at CLIENT level, for the member's Client badge. */
export const LIBRARY_CLIENT_ID = '17171717-1717-4171-8171-171717171717';
export const LIBRARY_CLIENT_TITLE = 'Client handover';

/** The admin's "What clients see" item (client logins C1). */
export const CLIENT_ITEM_ID = '12121212-1212-4121-8121-121212121212';
export const CLIENT_ITEM_TITLE = 'Project brief';
/** A second client item, gone to client after the check, reachable through
 *  an old link on a folder above it (audit A7, A11, A25). */
export const NEW_CLIENT_ITEM_ID = '18181818-1818-4181-8181-181818181818';
export const NEW_CLIENT_ITEM_TITLE = 'Launch plan';
export const OLD_FOLDER_SHARE_ID = '21212121-2121-4212-8212-212121212121';
export const OLD_FOLDER_TITLE = 'Handover folder';
/** A client-level note with its own old client link (made when client meant
 *  "anyone with the link") and one on a folder above it (audit A30, A11). */
export const CLIENT_NOTE_ID = '19191919-1919-4191-8191-191919191919';
export const CLIENT_NOTE_TITLE = 'Client note';
export const OLD_NOTE_SHARE_ID = '20202020-2020-4202-8202-202020202020';
/** Shared links on a C3 brain: one live link on a public page, and the old
 *  client link on CLIENT_ITEM_ID that C3 retired (no token: it is dead). */
export const PUBLIC_SHARE_ID = '25252525-2525-4252-8252-252525252525';
export const PUBLIC_PAGE_ID = '26262626-2626-4262-8262-262626262626';
export const PUBLIC_PAGE_TITLE = 'Price list';
export const RETIRED_SHARE_ID = '27272727-2727-4272-8272-272727272727';

/** The member's password in the mock; a change replaces it. */
export const MEMBER_PASSWORD = 'first-password-1';

/** Member invites (Phase 6). GOOD previews and redeems; STALE previews but
 *  was used meanwhile, so accept refuses it (the uniform 401). Any other code
 *  previews as the uniform 404, OLD_TEAM_CODE included: the brain dropped
 *  team codes (migration 0178), so an old one redeems nothing. */
export const INVITE_GOOD_CODE = 'GoodCode2345abcd';
/** An old 8-character team code, as an old /team link or a person might
 *  still carry one. */
export const OLD_TEAM_CODE = 'Xy7kPq2M';
export const INVITE_STALE_CODE = 'StaleCode234abcd';
export const INVITE_EMAIL = 'sam@example.com';
export const INVITE_NAME = 'Sam Botha';
export const INVITE_SITE = 'Field Office';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export type MockMemberApi = {
  /** The page's server draft, as the last accepted PUT left it. */
  draft: Doc | null;
  draftRev: number;
  /** Every draft PUT body, in order, with when it arrived (Date.now()). */
  puts: { doc: Doc; if_rev?: number; at: number }[];
  /** Set to a status to have every draft PUT fail with it (a brain that
   *  refuses the write, e.g. Postgres on a NUL character: 500). */
  failDrafts: number | null;
  /** Set to have the page submitted from "another tab": its row reads
   *  submitted and every draft PUT is refused 409 `frozen`. */
  frozen: boolean;
  /** Admin-only routes the page called (should stay empty). */
  adminCalls: string[];
  /** Client role: every route the page called that refused the client. */
  clientCalls: string[];
  /** Client role: every client route the page called (answered). */
  clientRouteCalls: string[];
  /** Client role: the client's own chat (C4). */
  clientChat: MockClientChat;
  /** Client role: false makes every client route a 401 (the session ended,
   *  or nobody signed in yet); a good sign-in link sets it. */
  clientSession: boolean;
  /** Every sign-in link redeem the page sent, with the answer's status. */
  clientSignIns: { code: string; email: string; status: number }[];
  /** GET /api/auth/client-code: this brain sends sign-in codes (C2b). */
  clientCodes: boolean;
  /** Shared with you also lists SHARED_TABLE_ID, in this shape (audit B13):
   *  'allowlisted' (a brain with the fixes) or 'record' (an older brain). */
  sharedTable: 'allowlisted' | 'record' | null;
  /** Shared with you also lists SHARED_LATER_ID (shared since the list
   *  loaded, audit B27). */
  sharedLater: boolean;
  /** Every code request the page sent, with the answer's status. */
  clientCodeRequests: { email: string; status: number }[];
  /** Every code verify the page sent, with the answer's status. */
  clientCodeVerifies: { email: string; code: string; status: number }[];
  /** Member role: the Library list answers (a team and a client row). */
  libraryList: boolean;
  /** Member role: GET /api/member/items answers, as a brain from 0.232.334
   *  does; false answers 404, as an older brain does (the client then
   *  merges the four source lists itself). */
  itemsRoute: boolean;
  /** The `state=` of every /api/member/items request, in order. */
  itemsStates: string[];
  /** Member asset routes the page called. */
  memberAssetCalls: string[];
  /** Every password change the page sent, in order. */
  passwordChanges: { oldPassword: string; newPassword: string }[];
  /** Every invite accept the page sent, in order, with the answer's status. */
  inviteAccepts: { code: string; password: string; status: number }[];
  /** Every token sign-in the page sent (the split client after an accept). */
  tokenSignIns: { email: string; password: string }[];
  /** Every sign-out the page sent, in order: the route and its body. */
  logouts: { path: string; body: unknown }[];
  /** What GET /api/version answers; set `contractVersion` to fake a brain
   *  on another wire contract. */
  version: { version: string; contractVersion?: number };
  /** Take over, the member's side: TAKEN_ID is with an admin. */
  withAdmin: boolean;
  /** ...and Mine's list says so (false: a list read before the take over,
   *  so only the item's own 409 tells). */
  listWithAdmin: boolean;
  /** Mine holds HOLDER (submitted) and BUNDLE_CHILD inside it: the child's
   *  draft PUTs answer 409 `frozen` naming the holder. */
  bundle: boolean;
  /** Submit of PAGE_ID answers 409 `unsaved-draft` naming BUNDLE_CHILD. */
  submitUnsaved: boolean;
  /** Accepted lists CHANGED_FILE_ID, which an admin changed since. */
  changedFile: boolean;
  /** Every member request for an item an admin holds (should be none when
   *  the list already said so). */
  withAdminReads: string[];
  /** Admin: the Review queue, the admin's private rows, and what was done. */
  admin: MockAdminState;
  close: () => Promise<void>;
};

type MovedItem = { id: string; type: string; title: string };

export type MockAdminState = {
  /** Submission ids still waiting in the queue. */
  queue: string[];
  /** Items in the admin's private space: their own, and taken ones. */
  privateIds: string[];
  /** Can the member of a taken item still take it back? */
  authorActive: boolean;
  /** Set to make Take over answer this instead (a refusal). */
  takeOverAnswer: { status: number; body: unknown } | null;
  /** Set to make Give back answer this instead (a refusal). */
  giveBackAnswer: { status: number; body: unknown } | null;
  takeOvers: string[];
  giveBacks: { id: string; note: string }[];
  accepts: { id: string; body: unknown }[];
  deletes: string[];
  /** "What clients see": the ids of each acknowledgement recorded. */
  clientAcks: string[][];
  /** Every acknowledgement body sent, as sent. */
  clientAckBodies: unknown[];
  /** The client-level items the report lists (CLIENT_ITEM_ID,
   *  NEW_CLIENT_ITEM_ID). */
  clientItems: string[];
  /** The report carries a fingerprint (a current brain); false: an older
   *  one, acknowledged by the ids shown. */
  reportFingerprint: boolean;
  /** The next acknowledgement answers 409 report-changed (the set moved). */
  reportChangedOnce: boolean;
  /** /api/shell answers 500 this many more times (the Try again screen). */
  shellFailures: number;
  /** Every /api/shell request. */
  shellCalls: number;
  /** CLIENT_NOTE_ID's own old client link is live. */
  noteShare: boolean;
  /** Link revokes (DELETE /api/shares/:id), by share id. */
  revokes: string[];
  /** Shared links (GET /api/team-admin/shares): whether PUBLIC_SHARE_ID is
   *  live, and whether the brain lists the links C3 retired (false: a brain
   *  before C3, whose answer has no `retired`). */
  publicShare: boolean;
  sendsRetired: boolean;
  /** Team admin > Clients: the client logins, and what was done to them. */
  clientLogins: Record<string, unknown>[];
  clientCreates: unknown[];
  signinLinksIssued: string[];
  userPatches: { id: string; body: unknown }[];
  userDeletes: string[];
  /** Sign-in codes by email (C2b): the sender's id (null: codes off), the
   *  day's count, whether the cap is reached, every PUT body, and a refusal
   *  the next PUT answers instead. */
  signinSender: {
    senderId: string | null;
    sentLast24h: number;
    capReached: boolean;
    puts: unknown[];
    refusal: { status: number; body: unknown } | null;
    /** The audit fix fields (B3) the card answer carries, when set. */
    extra: Record<string, unknown>;
    /** GET …/signin-sender/preview (B4): false answers 404 (an older
     *  brain); else per account id, the preview (default: can use, Sent
     *  and Sent Items). */
    preview: boolean;
    previews: Record<string, { sentFolders: string[]; canUse: boolean; reason?: string }>;
    /** Every preview asked, by account id. */
    previewCalls: string[];
  };
  /** Member chats (B26): rows the roster answers, when set. */
  memberChats: Record<string, unknown>[] | null;
  /** Clients' chat use today (C4): the answer, or null for a brain before
   *  C4 (404). */
  chatUsage: Record<string, unknown> | null;
  /** The Requests tab's rows (C4: a client's carries fromClient). */
  requests: Record<string, unknown>[];
};

export type MockClientChat = {
  /** null: the chat is not open (no client-level agent). */
  agent: { name: string } | null;
  messages: {
    id: string;
    direction: 'inbound' | 'outbound';
    text: string;
    status: 'pending' | 'complete' | 'failed';
    failed: boolean;
    createdAt: string;
  }[];
  /** Every send, with its Idempotency-Key and the answer's status. */
  posts: { text: string; key: string | null; status: number }[];
  /** Every GET of the thread, with when it arrived (Date.now()). */
  gets: number[];
  /** Set to have every send refused with this (a limit reached). */
  refusal: { status: number; body: unknown } | null;
  /** Asks of the thread left before the pending reply completes. */
  replyAfter: number;
};

/** Sign the browser in as a member, the way the client sees it: the
 *  presence cookie and the member hint (both UX-only; the API is mocked). */
export async function signInAsMember(context: BrowserContext, baseURL: string): Promise<void> {
  await context.addCookies([
    { name: 'mantle_authed', value: '1', url: baseURL },
    { name: 'mantle_member', value: '1', url: baseURL },
  ]);
}

/** Sign the browser in as an admin: the presence cookie only (no member
 *  hint), so the owner shell renders. */
/**
 * Serve this browser as a SAME-ORIGIN box: /env.js names no API base, and
 * every /api/* request on the page's own origin is answered by the mock.
 * A client signs in only on the brain's own origin (its session is a cookie
 * there), so the client sign-in specs run this way; without it the owner UI
 * calls the mock cross-origin (a split box), where client sign-in is not
 * offered at all (audit B27).
 */
export async function serveSameOrigin(context: BrowserContext, baseURL: string): Promise<void> {
  const origin = new URL(baseURL).origin;
  await context.route(`${origin}/env.js`, (route) =>
    route.fulfill({
      contentType: 'application/javascript; charset=utf-8',
      body: `window.__MANTLE_ENV__ = ${JSON.stringify({ apiBase: '', serverOrigin: '' })};`,
    }),
  );
  await context.route(
    (url) => url.origin === origin && url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${MOCK_API_ORIGIN}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    },
  );
}

export async function signInAsAdmin(context: BrowserContext, baseURL: string): Promise<void> {
  await context.addCookies([{ name: 'mantle_authed', value: '1', url: baseURL }]);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startMockMemberApi(
  clientOrigin: string,
  opts: { role?: 'member' | 'admin' | 'client' } = {},
): Promise<MockMemberApi> {
  const role = opts.role ?? 'member';
  const state: MockMemberApi = {
    draft: null,
    draftRev: 0,
    puts: [],
    failDrafts: null,
    frozen: false,
    adminCalls: [],
    clientCalls: [],
    clientRouteCalls: [],
    clientChat: {
      agent: { name: CLIENT_AGENT_NAME },
      messages: [],
      posts: [],
      gets: [],
      refusal: null,
      replyAfter: 0,
    },
    clientSession: true,
    clientSignIns: [],
    clientCodes: false,
    sharedTable: null,
    sharedLater: false,
    clientCodeRequests: [],
    clientCodeVerifies: [],
    libraryList: false,
    itemsRoute: true,
    itemsStates: [],
    memberAssetCalls: [],
    passwordChanges: [],
    inviteAccepts: [],
    tokenSignIns: [],
    logouts: [],
    version: { version: 'mock' },
    withAdmin: false,
    listWithAdmin: true,
    bundle: false,
    submitUnsaved: false,
    changedFile: false,
    withAdminReads: [],
    admin: {
      queue: [SUBMITTED_ID, RELEASED_ID],
      privateIds: [ADMIN_OWN_ID],
      authorActive: true,
      takeOverAnswer: null,
      giveBackAnswer: null,
      takeOvers: [],
      giveBacks: [],
      accepts: [],
      deletes: [],
      clientAcks: [],
      clientAckBodies: [],
      clientItems: [CLIENT_ITEM_ID],
      reportFingerprint: true,
      reportChangedOnce: false,
      shellFailures: 0,
      shellCalls: 0,
      noteShare: true,
      revokes: [],
      publicShare: true,
      sendsRetired: true,
      clientLogins: [],
      clientCreates: [],
      signinLinksIssued: [],
      userPatches: [],
      userDeletes: [],
      signinSender: {
        senderId: null,
        sentLast24h: 0,
        capReached: false,
        puts: [],
        refusal: null,
        extra: {},
        preview: true,
        previews: {},
        previewCalls: [],
      },
      memberChats: null,
      chatUsage: null,
      requests: [],
    },
    close: async () => undefined,
  };
  const now = new Date().toISOString();
  let password = MEMBER_PASSWORD;
  const row = () => ({
    id: PAGE_ID,
    type: 'page',
    title: PAGE_TITLE,
    icon: null,
    sharing: 'private',
    reviewState: state.frozen ? 'submitted' : 'draft',
    submittedAt: state.frozen ? now : null,
    returnedNote: null,
    authorLoginId: 'login-1',
    updatedAt: now,
  });

  /** A member row of Mine, in the brain's shape. */
  const spaceRow = (id: string, title: string, reviewState: string, type = 'page') => ({
    id,
    type,
    title,
    icon: null,
    sharing: 'private',
    reviewState,
    submittedAt: reviewState === 'submitted' || reviewState === 'with-admin' ? now : null,
    returnedNote: null,
    authorLoginId: 'login-1',
    updatedAt: now,
  });
  const pageBody = (title: string, text: string) => ({
    type: 'page',
    page: {
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      draft: null,
      draftRev: 0,
      title,
    },
  });
  const withAdminRefusal = {
    error:
      'An admin is working on this item. It comes back to you if they give it back; if they accept it, it shows under Accepted.',
    reason: 'with-admin',
  };

  // ── The admin side (role 'admin') ─────────────────────────────────────
  const A = state.admin;
  const fingerprint = () => `fp-${[...A.clientItems].sort().join(',')}`;
  const folderLink = () => ({
    shareId: OLD_FOLDER_SHARE_ID,
    nodeId: 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0',
    title: OLD_FOLDER_TITLE,
    type: 'branch',
    via: 'folder',
  });
  const reportItem = (id: string) =>
    id === NEW_CLIENT_ITEM_ID
      ? {
          id,
          type: 'file',
          title: NEW_CLIENT_ITEM_TITLE,
          updatedAt: now,
          link: null,
          emailedTo: [],
          refsAbove: [],
          oldLinksAbove: [folderLink()],
        }
      : {
          id: CLIENT_ITEM_ID,
          type: 'page',
          title: CLIENT_ITEM_TITLE,
          updatedAt: now,
          link: null,
          emailedTo: ['pat@example.com'],
          refsAbove: [
            { id: ADMIN_OWN_ID, type: 'page', title: 'Internal pricing', audience: 'team' },
            // Not the brain's (a personal item): never its title.
            { id: 'abababab-abab-4aba-8aba-abababababab', type: null, title: null, audience: null },
          ],
        };
  const noteRow = () => ({
    id: CLIENT_NOTE_ID,
    title: CLIENT_NOTE_TITLE,
    content: 'For the client.',
    tags: [],
    summary: null,
    createdAt: now,
    updatedAt: now,
    audience: 'client',
  });
  const member = () => ({
    loginId: 'login-1',
    name: MEMBER_NAME,
    email: 'member@example.com',
    inactive: false,
  });
  const queueRow = (id: string) =>
    id === RELEASED_ID
      ? {
          ...spaceRow(RELEASED_ID, RELEASED_TITLE, 'taken'),
          reason: 'submitted',
          author: member(),
        }
      : {
          ...spaceRow(SUBMITTED_ID, SUBMITTED_TITLE, 'submitted'),
          reason: 'submitted',
          author: member(),
        };
  const TAKEN_BY_ADMIN = new Set([SUBMITTED_ID, RELEASED_ID]);
  const privateRow = (id: string) => {
    const title =
      id === ADMIN_OWN_ID ? ADMIN_OWN_TITLE : id === RELEASED_ID ? RELEASED_TITLE : SUBMITTED_TITLE;
    const taken = TAKEN_BY_ADMIN.has(id);
    return {
      ...spaceRow(id, title, taken ? 'taken' : 'draft'),
      authorLoginId: taken ? 'login-1' : 'admin-1',
      takenFrom: taken
        ? {
            loginId: 'login-1',
            name: MEMBER_NAME,
            canGiveBack: A.authorActive,
            takenAt: now,
          }
        : null,
    };
  };
  const moved = (id: string): MovedItem[] => [
    { id, type: 'page', title: queueRow(id).title },
    ...(id === SUBMITTED_ID ? [{ id: FILE_ID, type: 'file', title: SUBMITTED_IMAGE_TITLE }] : []),
  ];

  /** The admin routes; true when it answered. */
  const handleAdmin = async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    path: string,
    method: string,
  ): Promise<boolean> => {
    if (path === '/api/shell') {
      A.shellCalls += 1;
      if (A.shellFailures > 0) {
        A.shellFailures -= 1;
        json(res, 500, { error: 'Internal Server Error' });
        return true;
      }
      json(res, 200, {
        onboarded: true,
        avatar: null,
        avatarPhotoVersion: null,
        pendingApprovals: 0,
        displayName: 'Ada Admin',
        email: 'admin@example.com',
        siteName: null,
        peerName: null,
        logoVersion: null,
        logoDarkVersion: null,
        colorTheme: null,
        fontLogo: null,
        fontTitle: null,
        fontUi: null,
        fontProse: null,
        fontSize: null,
        fontLogoSize: null,
        fontTitleSize: null,
        fontProseSize: null,
        assetToken: '',
      });
      return true;
    }
    if (path === '/api/team-admin/submissions' && method === 'GET') {
      const items = A.queue.map(queueRow);
      json(res, 200, { items, counts: { submitted: items.length, leftBehind: 0 } });
      return true;
    }
    const sub = /^\/api\/team-admin\/submissions\/([0-9a-f-]{36})(\/[a-z-]+)?$/.exec(path);
    if (sub) {
      const [, id, tail] = sub as unknown as [string, string, string | undefined];
      const waiting = A.queue.includes(id);
      if (!tail && method === 'GET') {
        if (!waiting) return (json(res, 404, { error: 'Not found.' }), true);
        json(res, 200, {
          row: queueRow(id),
          body: pageBody(queueRow(id).title, 'Checked the hook.'),
          comments: [],
        });
        return true;
      }
      if (tail === '/bundle' && method === 'GET') {
        json(res, 200, {
          items: moved(id).map(({ id: i, type, title }) => ({ id: i, type, title })),
          linksStayingBehind: 0,
        });
        return true;
      }
      if (tail === '/take-over' && method === 'POST') {
        A.takeOvers.push(id);
        if (A.takeOverAnswer) {
          json(res, A.takeOverAnswer.status, A.takeOverAnswer.body);
          return true;
        }
        if (!waiting) return (json(res, 404, { error: 'Not found.' }), true);
        A.queue = A.queue.filter((q) => q !== id);
        A.privateIds = [id, ...A.privateIds];
        json(res, 200, { id, moved: moved(id) });
        return true;
      }
      json(res, 404, { error: `not mocked: ${method} ${path}` });
      return true;
    }
    // "What clients see" (client logins C1): the client items, what went to
    // client since the newest acknowledgement, and (a current brain) the
    // fingerprint of the whole set.
    if (path === '/api/access/client-report' && method === 'GET') {
      const last = A.clientAcks.at(-1);
      const newSinceAck = A.clientItems.filter((id) => !last?.includes(id));
      json(res, 200, {
        items: A.clientItems.map(reportItem),
        total: A.clientItems.length,
        acknowledgement: last
          ? { ackedAt: now, ackedBy: { id: 'admin-1', name: 'Ada Admin' }, itemCount: last.length }
          : null,
        acknowledged: !!last && newSinceAck.length === 0,
        newSinceAck,
        ...(A.reportFingerprint ? { fingerprint: fingerprint() } : {}),
      });
      return true;
    }
    // The Access control (audit A30): a client note with its own old link
    // and one on a folder above it; the popover reads it and revokes links.
    if (path === '/api/notes' && method === 'GET') {
      json(res, 200, { notes: [noteRow()], total: 1, page: 1, pageSize: 50, tags: [] });
      return true;
    }
    if (path === `/api/notes/${CLIENT_NOTE_ID}` && method === 'GET') {
      json(res, 200, { note: noteRow() });
      return true;
    }
    if (path === `/api/access/nodes/${CLIENT_NOTE_ID}` && method === 'GET') {
      json(res, 200, {
        item: { id: CLIENT_NOTE_ID, type: 'note', title: CLIENT_NOTE_TITLE, audience: 'client' },
        closure: [],
        share: A.noteShare
          ? {
              id: OLD_NOTE_SHARE_ID,
              token: 'oldnotetoken',
              path: '/s/oldnotetoken',
              mode: 'public',
              cascade: false,
            }
          : null,
        childCount: 0,
        canLower: true,
        canLink: true,
        embedsFollow: true,
        openLinkLevels: ['public'],
        oldLinksAbove: A.revokes.includes(OLD_FOLDER_SHARE_ID) ? [] : [folderLink()],
      });
      return true;
    }
    // Shared links (client logins C3): the live links, all public, and the
    // old client links the brain retired, as a C3 brain answers.
    if (path === '/api/team-admin/shares' && method === 'GET') {
      json(res, 200, {
        badges: { openRequestCount: 0 },
        shares: A.publicShare
          ? [
              {
                id: PUBLIC_SHARE_ID,
                path: '/s/publicpagetoken',
                nodeId: PUBLIC_PAGE_ID,
                nodeType: 'page',
                title: PUBLIC_PAGE_TITLE,
                icon: null,
                cascade: false,
                createdAt: now,
                viewCount: 3,
                lastViewedAt: now,
                level: 'public',
              },
            ]
          : [],
        ...(A.sendsRetired
          ? {
              retired: [
                {
                  id: RETIRED_SHARE_ID,
                  nodeId: CLIENT_ITEM_ID,
                  nodeType: 'page',
                  title: CLIENT_ITEM_TITLE,
                  icon: null,
                  level: 'client',
                  createdAt: '2026-03-01T10:00:00.000Z',
                  retiredAt: '2026-09-29T08:00:00.000Z',
                  viewCount: 7,
                  lastViewedAt: '2026-09-20T09:00:00.000Z',
                },
              ],
            }
          : {}),
      });
      return true;
    }
    const share = /^\/api\/shares\/([0-9a-f-]{36})$/.exec(path);
    if (share && method === 'DELETE') {
      A.revokes.push(share[1]!);
      if (share[1] === OLD_NOTE_SHARE_ID) A.noteShare = false;
      if (share[1] === PUBLIC_SHARE_ID) A.publicShare = false;
      json(res, 200, { ok: true });
      return true;
    }
    // Team admin > Clients (client logins C2). Acknowledged once What
    // clients see was checked here.
    const acked = () => A.clientAcks.length > 0;
    if (path === '/api/team-admin/clients' && method === 'GET') {
      json(res, 200, { clients: A.clientLogins, reportAcknowledged: acked() });
      return true;
    }
    if (path === '/api/team-admin/clients' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { email?: string; displayName?: string };
      A.clientCreates.push(body);
      if (!acked()) {
        json(res, 409, { error: 'Check the report first.', reason: 'report-not-acknowledged' });
        return true;
      }
      const client = {
        id: CLIENT_LOGIN_ID,
        email: body.email ?? CLIENT_EMAIL,
        displayName: body.displayName ?? null,
        contactId: null,
        disabled: false,
        createdAt: now,
        lastLoginAt: null,
        openLink: null,
        lastLinkUsedAt: null,
      };
      A.clientLogins = [client, ...A.clientLogins];
      json(res, 201, { client });
      return true;
    }
    const link = /^\/api\/team-admin\/clients\/([0-9a-f-]{36})\/signin-link$/.exec(path);
    if (link) {
      const id = link[1]!;
      const row = A.clientLogins.find((c) => c.id === id);
      if (!row) return (json(res, 404, { error: 'Not a client.', reason: 'not-a-client' }), true);
      if (method === 'POST') {
        if (!acked()) {
          json(res, 409, { error: 'Check the report first.', reason: 'report-not-acknowledged' });
          return true;
        }
        A.signinLinksIssued.push(id);
        const issued = { id: 'link-1', createdAt: now, expiresAt: '2099-01-01T00:00:00.000Z' };
        row.openLink = issued;
        json(res, 201, {
          link: issued,
          code: CLIENT_GOOD_CODE,
          // Brains with the audit fixes (B12): the code in the fragment.
          path: `/client-signin#code=${CLIENT_GOOD_CODE}`,
        });
        return true;
      }
      if (method === 'DELETE') {
        if (!row.openLink) return (json(res, 404, { error: 'No open sign-in link.' }), true);
        row.openLink = null;
        json(res, 200, { ok: true });
        return true;
      }
    }
    // What picking a sender would do (audit B4); an older brain has no such
    // route (404).
    if (path === '/api/team-admin/clients/signin-sender/preview' && method === 'GET') {
      const S = A.signinSender;
      const id = url.searchParams.get('accountId') ?? '';
      S.previewCalls.push(id);
      if (!S.preview) return (json(res, 404, { error: 'Not found.' }), true);
      json(res, 200, S.previews[id] ?? { sentFolders: ['Sent', 'Sent Items'], canUse: true });
      return true;
    }
    // The clients' chat use today (C4); a brain before C4 has no such route.
    if (path === '/api/team-admin/clients/usage' && method === 'GET') {
      if (!A.chatUsage) return (json(res, 404, { error: 'Not found.' }), true);
      json(res, 200, A.chatUsage);
      return true;
    }
    if (path === '/api/team-admin/requests' && method === 'GET') {
      const open = A.requests.filter((r) => r.status !== 'done').length;
      json(res, 200, { badges: { openRequestCount: open }, requests: A.requests });
      return true;
    }
    // Member chats (B26): the roster with a client row, when set.
    if (path === '/api/team-admin/member-chats' && method === 'GET' && A.memberChats) {
      json(res, 200, { members: A.memberChats, selected: null });
      return true;
    }
    // Sign-in codes by email (C2b): the sender and the day's count.
    if (path === '/api/team-admin/clients/signin-sender') {
      const S = A.signinSender;
      const answer = () => {
        const sender = [SENDER_DESK, SENDER_INFO].find((c) => c.id === S.senderId) ?? null;
        json(res, 200, {
          sender,
          candidates: [SENDER_DESK, SENDER_INFO],
          sentFoldersExcluded: sender ? ['Sent', 'Sent Items'] : [],
          dailyCap: 200,
          sentLast24h: S.sentLast24h,
          capReached: S.capReached,
          ...S.extra,
        });
        return true;
      };
      if (method === 'GET') return answer();
      if (method === 'PUT') {
        const body = JSON.parse(await readBody(req)) as { accountId?: string | null };
        S.puts.push(body);
        if (S.refusal) {
          const { status, body: out } = S.refusal;
          S.refusal = null;
          json(res, status, out);
          return true;
        }
        S.senderId = body.accountId ?? null;
        return answer();
      }
    }
    const user = /^\/api\/users\/([0-9a-f-]{36})$/.exec(path);
    if (user) {
      const id = user[1]!;
      if (method === 'PATCH') {
        const body = JSON.parse(await readBody(req)) as { disabled?: boolean };
        A.userPatches.push({ id, body });
        const row = A.clientLogins.find((c) => c.id === id);
        if (row && typeof body.disabled === 'boolean') row.disabled = body.disabled;
        json(res, 200, { ok: true });
        return true;
      }
      if (method === 'DELETE') {
        A.userDeletes.push(id);
        A.clientLogins = A.clientLogins.filter((c) => c.id !== id);
        json(res, 200, { ok: true });
        return true;
      }
    }
    if (path === '/api/access/client-report/ack' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { itemIds?: string[]; fingerprint?: string };
      A.clientAckBodies.push(body);
      if (A.reportChangedOnce || (body.fingerprint && body.fingerprint !== fingerprint())) {
        A.reportChangedOnce = false;
        json(res, 409, {
          error: 'conflict',
          reason: 'report-changed',
          message: 'The client list changed. Reload it and check again.',
        });
        return true;
      }
      // A fingerprint acknowledges the whole current set; ids, what was shown.
      const ids = body.fingerprint
        ? [...A.clientItems]
        : (body.itemIds ?? []).filter((id) => A.clientItems.includes(id));
      A.clientAcks.push(ids);
      json(res, 200, {
        acknowledgement: {
          ackedAt: now,
          ackedBy: { id: 'admin-1', name: 'Ada Admin' },
          itemCount: ids.length,
        },
        acknowledged: A.clientItems.every((id) => ids.includes(id)),
      });
      return true;
    }
    // The owner /pages list (item-list alignment): with `state=all` or
    // `private` the brain adds the admin's own private pages as
    // AdminPrivateListRow rows (the `private` key holds the space row).
    // This brain holds no brain pages.
    if (path === '/api/pages' && method === 'GET') {
      const state = url.searchParams.get('state');
      const pages =
        state === 'all' || state === 'private'
          ? A.privateIds.map((id) => {
              const row = privateRow(id);
              return {
                id,
                type: 'page',
                title: row.title,
                icon: row.icon,
                createdAt: row.updatedAt,
                updatedAt: row.updatedAt,
                private: row,
              };
            })
          : [];
      json(res, 200, {
        mode: 'tree',
        pages,
        total: pages.length,
        page: 1,
        pageSize: 2000,
        tags: [],
      });
      return true;
    }
    if (path === '/api/admin/space' && method === 'GET') {
      const items = url.searchParams.get('kind') === 'page' ? A.privateIds.map(privateRow) : [];
      json(res, 200, { items, total: items.length, page: 1, pageSize: 20 });
      return true;
    }
    const own = /^\/api\/admin\/space\/([0-9a-f-]{36})(\/[a-z-]+)?$/.exec(path);
    if (own) {
      const [, id, tail] = own as unknown as [string, string, string | undefined];
      if (!A.privateIds.includes(id)) return (json(res, 404, { error: 'Not found.' }), true);
      const row = privateRow(id);
      if (!tail && method === 'GET') {
        json(res, 200, { row, body: pageBody(row.title, 'Checked the hook.') });
        return true;
      }
      if (!tail && method === 'DELETE') {
        A.deletes.push(id);
        if (row.takenFrom?.canGiveBack) {
          json(res, 409, { error: 'The member can still take this back.', reason: 'taken' });
          return true;
        }
        A.privateIds = A.privateIds.filter((i) => i !== id);
        json(res, 200, { ok: true });
        return true;
      }
      if (tail === '/draft' && method === 'PUT') {
        await readBody(req);
        json(res, 200, { ok: true, draft_rev: 1 });
        return true;
      }
      if (tail === '/give-back' && method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { note: string };
        A.giveBacks.push({ id, note: body.note });
        if (A.giveBackAnswer) {
          json(res, A.giveBackAnswer.status, A.giveBackAnswer.body);
          return true;
        }
        if (!row.takenFrom) return (json(res, 404, { error: 'Not found.' }), true);
        A.privateIds = A.privateIds.filter((i) => i !== id);
        json(res, 200, { id, returned: moved(id) });
        return true;
      }
      if (tail === '/accept' && method === 'POST') {
        const body = JSON.parse(await readBody(req)) as unknown;
        A.accepts.push({ id, body });
        A.privateIds = A.privateIds.filter((i) => i !== id);
        json(res, 200, { id, audience: 'admin', moved: moved(id), linksStayingBehind: 0 });
        return true;
      }
    }
    return false;
  };

  const acceptedRow = () => ({
    id: ACCEPTED_ID,
    type: 'page',
    title: ACCEPTED_TITLE,
    icon: null,
    audience: 'admin',
    acceptedAt: ACCEPTED_AT,
    updatedAt: now,
  });

  const changedFileRow = () => ({
    id: CHANGED_FILE_ID,
    type: 'file',
    title: CHANGED_FILE_NAME,
    icon: null,
    audience: 'team',
    acceptedAt: ACCEPTED_AT,
    updatedAt: now,
  });

  // ── The client side (role 'client', C2) ───────────────────────────────
  const sharedRows = () => [
    ...(state.sharedLater
      ? [
          {
            id: SHARED_LATER_ID,
            type: 'note',
            title: SHARED_LATER_TITLE,
            icon: null,
            summary: null,
            updatedAt: '2026-09-29T10:00:00.000Z',
          },
        ]
      : []),
    {
      id: SHARED_PAGE_ID,
      type: 'page',
      title: SHARED_PAGE_TITLE,
      icon: null,
      // An older brain's summary, from the unredacted text (B1).
      summary: LEAKY_SUMMARY,
      updatedAt: '2026-09-28T10:00:00.000Z',
    },
    {
      id: SHARED_NOTE_ID,
      type: 'note',
      title: SHARED_NOTE_TITLE,
      icon: null,
      summary: null,
      updatedAt: '2026-09-27T10:00:00.000Z',
    },
    {
      id: SHARED_FILE_ID,
      type: 'file',
      title: SHARED_FILE_TITLE,
      icon: null,
      summary: null,
      updatedAt: '2026-09-26T10:00:00.000Z',
    },
    ...(state.sharedTable
      ? [
          {
            id: SHARED_TABLE_ID,
            type: 'table',
            title: SHARED_TABLE_TITLE,
            icon: null,
            summary: state.sharedTable === 'record' ? LEAKY_SUMMARY : undefined,
            updatedAt: '2026-09-25T10:00:00.000Z',
          },
        ]
      : []),
  ];
  const TABLE_COLUMNS = [
    { id: 'c1', name: 'Item', type: 'text' },
    { id: 'c2', name: 'Price', type: 'number' },
  ];
  const TABLE_ROWS = [
    { id: 'r1', cells: { c1: 'Survey', c2: 1200 } },
    { id: 'r2', cells: { c1: 'Report', c2: 800 } },
  ];
  const sharedItem = (id: string): Record<string, unknown> | null => {
    const row = sharedRows().find((r) => r.id === id);
    if (!row) return null;
    if (row.type === 'page') {
      return {
        ...row,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'The brief. See ' },
                // The brain's redactions: a mention and a link to nowhere.
                { type: 'mention', attrs: { id: null, label: PRIVATE_LABEL, ref: 'node' } },
                { type: 'text', text: ' and ' },
                {
                  type: 'text',
                  text: PRIVATE_LABEL,
                  marks: [{ type: 'link', attrs: { href: null } }],
                },
                { type: 'text', text: '. Also ' },
                {
                  type: 'text',
                  text: 'the meeting notes',
                  marks: [{ type: 'link', attrs: { href: `/n/${SHARED_NOTE_ID}` } }],
                },
                { type: 'text', text: '.' },
              ],
            },
            // References the client may read (audit B27): a mention chip
            // of the shared note, and the shared file embedded.
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Minutes: ' },
                {
                  type: 'mention',
                  attrs: {
                    id: SHARED_NOTE_ID,
                    label: SHARED_NOTE_TITLE,
                    ref: 'node',
                    kind: 'note',
                  },
                },
              ],
            },
            {
              type: 'fileEmbed',
              attrs: {
                nodeId: SHARED_FILE_ID,
                href: `/api/files/files/${SHARED_FILE_ID}?raw=1`,
                filename: SHARED_FILE_TITLE,
                mime: 'image/png',
                size: 68,
              },
            },
          ],
        },
      };
    }
    if (row.type === 'table') {
      const { summary: _summary, ...rest } = row;
      void _summary;
      return state.sharedTable === 'record'
        ? {
            ...row,
            // The whole record an older brain sends (B13).
            table: {
              id: SHARED_TABLE_ID,
              title: SHARED_TABLE_TITLE,
              description: TABLE_DESCRIPTION,
              tags: ['internal'],
              summary: LEAKY_SUMMARY,
              visibility: 'private',
              appLink: null,
              data: { columns: TABLE_COLUMNS, rows: TABLE_ROWS },
              draft: null,
              rowCount: TABLE_ROWS.length,
            },
          }
        : {
            ...rest,
            // The allowlisted shape (B13): the grid, its tabs and counts.
            table: {
              data: { columns: TABLE_COLUMNS, rows: TABLE_ROWS },
              docClipped: false,
              tabs: [],
              tabId: null,
              rowCount: TABLE_ROWS.length,
            },
          };
    }
    if (row.type === 'note') {
      return { ...row, content: `Agreed: ship it. Background in [${PRIVATE_LABEL}]().` };
    }
    return { ...row, filename: SHARED_FILE_TITLE, mimeType: 'image/png', sizeBytes: 68 };
  };
  // The client's own chat (C4): a send queues the turn, and the reply lands
  // on the second ask of the thread after it (the first still pending), as a
  // brain writes it a moment later.
  const C = state.clientChat;
  const handleClientChat = async (req: IncomingMessage, res: ServerResponse, method: string) => {
    if (method === 'GET') {
      C.gets.push(Date.now());
      const pending = C.messages.find((m) => m.status === 'pending');
      if (pending) {
        if (C.replyAfter <= 0) {
          pending.status = 'complete';
          pending.text = CLIENT_CHAT_REPLY;
        } else {
          C.replyAfter -= 1;
        }
      }
      return json(res, 200, { agent: C.agent, messages: C.messages });
    }
    if (method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    const body = JSON.parse((await readBody(req)) || '{}') as { text?: string };
    const text = body.text ?? '';
    const header = req.headers['idempotency-key'];
    const key = typeof header === 'string' ? header : null;
    const answer = (status: number, out: unknown) => {
      C.posts.push({ text, key, status });
      return json(res, status, out);
    };
    if (C.refusal) return answer(C.refusal.status, C.refusal.body);
    if (!C.agent) {
      return answer(409, { error: 'Chat is not open.', reason: 'chat-closed' });
    }
    const at = new Date().toISOString();
    const n = C.messages.length;
    C.messages.push(
      {
        id: `in-${n}`,
        direction: 'inbound',
        text,
        status: 'complete',
        failed: false,
        createdAt: at,
      },
      {
        id: `out-${n}`,
        direction: 'outbound',
        text: '',
        status: 'pending',
        failed: false,
        createdAt: at,
      },
    );
    C.replyAfter = 1;
    return answer(202, { turnId: `turn-${n}` });
  };

  const handleClient = async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    path: string,
    method: string,
  ) => {
    if (path === '/api/client/chat') return handleClientChat(req, res, method);
    if (path === '/api/client/shell') {
      return json(res, 200, {
        role: 'client',
        loginId: CLIENT_LOGIN_ID,
        displayName: CLIENT_NAME,
        email: CLIENT_EMAIL,
        assetToken: '',
        siteName: CLIENT_SITE,
        colorTheme: null,
        fontLogo: null,
        fontTitle: null,
        fontUi: null,
        fontProse: null,
        fontSize: null,
        fontLogoSize: null,
        fontTitleSize: null,
        fontProseSize: null,
        logoVersion: null,
        logoDarkVersion: null,
      });
    }
    if (path === '/api/client/shared') {
      const kind = url.searchParams.get('kind');
      const q = url.searchParams.get('q')?.toLowerCase() ?? '';
      const items = sharedRows().filter(
        (r) => (!kind || r.type === kind) && (!q || r.title.toLowerCase().includes(q)),
      );
      return json(res, 200, { items, total: items.length, page: 1, pageSize: 20 });
    }
    const one = /^\/api\/client\/shared\/([0-9a-f-]{36})$/.exec(path);
    if (one) {
      const item = sharedItem(one[1]!);
      return item ? json(res, 200, { item }) : json(res, 404, { error: 'Not found.' });
    }
    if (path.startsWith('/api/client/files/')) return send(res, 200, 'image/png', PNG_1PX);
    if (path.startsWith('/api/client/draws/')) {
      return send(res, 200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    }
    return json(res, 404, { error: `not mocked: ${path}` });
  };

  const cors = {
    'access-control-allow-origin': clientOrigin,
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, last-event-id, idempotency-key',
    'access-control-max-age': '600',
  };
  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { ...cors, 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const json = (res: ServerResponse, status: number, body: unknown) =>
    send(res, status, 'application/json', JSON.stringify(body));

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    // Public: the brain's appearance, with a peer name (a box's name), so a
    // spec can see which surfaces show it (audit B27).
    if (path === '/api/appearance' && method === 'GET') {
      return json(res, 200, { siteName: null, peerName: MOCK_PEER });
    }
    // Email sign-in codes (C2b): public, for every role, as the brain has
    // them. The request answers every email the same.
    if (path === '/api/auth/client-code' && method === 'GET') {
      return json(res, 200, { enabled: state.clientCodes });
    }
    if (path === '/api/auth/client-code' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { email?: string };
      const email = body.email ?? '';
      const status = email === CLIENT_CODE_RATE_EMAIL ? 429 : 200;
      state.clientCodeRequests.push({ email, status });
      return status === 429
        ? json(res, 429, { error: 'Too many attempts. Try again in a minute.' })
        : json(res, 200, { ok: true });
    }
    if (path === '/api/auth/client-code/verify' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { email?: string; code?: string };
      const email = body.email ?? '';
      const ok = email.toLowerCase() === CLIENT_EMAIL && body.code === CLIENT_EMAIL_CODE;
      state.clientCodeVerifies.push({ email, code: body.code ?? '', status: ok ? 200 : 401 });
      if (!ok) return json(res, 401, { error: CLIENT_CODE_NOT_VALID });
      state.clientSession = true;
      return json(res, 200, { ok: true });
    }
    // The client routes answer a client login only (C2).
    if (path.startsWith('/api/client/') && role !== 'client') {
      return json(res, 403, {
        error: 'forbidden',
        reason: role === 'admin' ? 'admin-login' : 'member-login',
        message: 'This route is for client logins.',
      });
    }
    if (role === 'client' && path.startsWith('/api/client/')) {
      if (!state.clientSession) return json(res, 401, { error: 'unauthorized' });
      state.clientRouteCalls.push(`${method} ${path}`);
      return handleClient(req, res, url, path, method);
    }
    if (path === '/api/auth/client-link' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { code?: string; email?: string };
      const answer = (status: number, out: unknown) => {
        state.clientSignIns.push({ code: body.code ?? '', email: body.email ?? '', status });
        return json(res, status, out);
      };
      if (body.code === CLIENT_RATE_CODE) {
        return answer(429, { error: 'Too many attempts. Try again in a minute.' });
      }
      if (body.code !== CLIENT_GOOD_CODE || body.email?.toLowerCase() !== CLIENT_EMAIL) {
        return answer(401, { error: 'This sign-in link is not valid. Ask for a new one.' });
      }
      state.clientSession = true;
      return answer(200, { ok: true });
    }
    if (role === 'client') {
      if (path.startsWith('/api/') && !CLIENT_OK.some((re) => re.test(path))) {
        state.clientCalls.push(`${method} ${path}`);
        return json(res, 403, {
          error: 'forbidden',
          reason: 'client-login',
          message: 'Not available to client logins.',
        });
      }
    } else if (role === 'admin') {
      if (await handleAdmin(req, res, url, path, method)) return;
    } else if (isAdminOnly(path)) {
      state.adminCalls.push(`${method} ${path}`);
      return json(res, 403, { error: 'forbidden', reason: 'member-login' });
    }
    if (path === '/api/member/shell') {
      return json(res, 200, {
        role: 'member',
        loginId: 'login-1',
        displayName: 'Mo Member',
        email: 'member@example.com',
        avatar: null,
        // Set, so a rail that still loads the admin photo route is caught.
        avatarPhotoVersion: 'abc12345',
        assetToken: '',
        siteName: null,
        colorTheme: null,
        fontLogo: null,
        fontTitle: null,
        fontUi: null,
        fontProse: null,
        fontSize: null,
        fontLogoSize: null,
        fontTitleSize: null,
        fontProseSize: null,
        logoVersion: null,
        logoDarkVersion: null,
      });
    }
    if (path === '/api/member/realtime') return send(res, 200, 'text/event-stream', ':\n\n');
    if (path === '/api/member/home') return json(res, 200, { homeApp: null, hub: null });
    if (path === '/api/member/apps') return json(res, 200, { apps: [], homeAppId: null });
    if (path === '/api/auth/change-password' && method === 'POST') {
      // The brain's own answers (server/web/app/api/auth/change-password).
      const body = JSON.parse(await readBody(req)) as { oldPassword: string; newPassword: string };
      state.passwordChanges.push(body);
      if (body.oldPassword !== password) {
        return json(res, 401, { error: 'Current password is incorrect.' });
      }
      password = body.newPassword;
      return json(res, 200, { ok: true });
    }
    // The public invite routes (server/web/app/api/auth/invite in mantle).
    if (path.startsWith('/api/auth/invite/') && path !== '/api/auth/invite/accept') {
      const code = decodeURIComponent(path.slice('/api/auth/invite/'.length));
      if ([INVITE_GOOD_CODE, INVITE_STALE_CODE].includes(code)) {
        return json(res, 200, {
          email: INVITE_EMAIL,
          displayName: INVITE_NAME,
          siteName: INVITE_SITE,
        });
      }
      return json(res, 404, { error: 'Invite not found.' });
    }
    if (path === '/api/auth/invite/accept' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { code: string; password: string };
      const answer = (status: number, out: unknown) => {
        state.inviteAccepts.push({ code: body.code, password: body.password, status });
        return json(res, status, out);
      };
      if (typeof body.password !== 'string' || body.password.length < 8) {
        return answer(400, { error: 'Choose a password of at least 8 characters.' });
      }
      if (body.code !== INVITE_GOOD_CODE) {
        return answer(401, { error: 'This invite is not valid. Ask for a new one.' });
      }
      password = body.password;
      return answer(200, { ok: true, email: INVITE_EMAIL });
    }
    // Sign-out (the brain's /api/auth/logout; `{ everywhere: true }` ends
    // every session of the login) and the bearer revoke the split client
    // sends first. Both answer ok, whatever the session.
    if ((path === '/api/auth/logout' || path === '/api/auth/mobile-logout') && method === 'POST') {
      const raw = await readBody(req);
      const parse = (): unknown => {
        try {
          return raw ? JSON.parse(raw) : null;
        } catch {
          return raw;
        }
      };
      state.logouts.push({ path, body: parse() });
      return json(res, 200, { ok: true });
    }
    if (path === '/api/auth/token' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { email: string; password: string };
      state.tokenSignIns.push({ email: body.email, password: body.password });
      if (body.email !== INVITE_EMAIL || body.password !== password) {
        return json(res, 401, { error: 'Invalid email or password.' });
      }
      return json(res, 200, { token: 'member-bearer-token' });
    }
    // An item an admin took over: every route of it answers 409 (audit F07).
    if (state.withAdmin && path.startsWith(`/api/member/space/${TAKEN_ID}`)) {
      state.withAdminReads.push(`${method} ${path}`);
      return json(res, 409, withAdminRefusal);
    }
    // The one list (item-list alignment): the brain reads each source under
    // its own rules and merges them newest first; here the sources are this
    // mock's own four lists, read over HTTP and merged the same way.
    if (path === '/api/member/items' && method === 'GET' && state.itemsRoute) {
      const kind = url.searchParams.get('kind') ?? 'page';
      const filter = url.searchParams.get('state') ?? 'all';
      state.itemsStates.push(filter);
      const qs = `kind=${encodeURIComponent(kind)}`;
      const read = async (p: string) => {
        const r = await fetch(`${MOCK_API_ORIGIN}${p}?${qs}`);
        return r.ok ? ((await r.json()) as { items: Record<string, unknown>[] }).items : [];
      };
      const [own, team, library, accepted] = await Promise.all([
        read('/api/member/space'),
        read('/api/member/team-drafts'),
        read('/api/member/library'),
        read('/api/member/accepted'),
      ]);
      const pill = (r: Record<string, unknown>) =>
        r.reviewState === 'with-admin' || r.reviewState === 'taken'
          ? 'with-admin'
          : r.reviewState === 'submitted' || r.reviewState === 'returned'
            ? r.reviewState
            : r.reviewState === 'accepted'
              ? null
              : r.sharing === 'team'
                ? 'draft'
                : 'private';
      const inLibrary = new Set(library.map((r) => r.id));
      const rows = [
        ...own.map((r) => ({ r, source: 'own', pill: pill(r), byMe: false })),
        ...team.map((r) => ({ r, source: 'team', pill: pill(r), byMe: false })),
        ...library.map((r) => ({ r, source: 'library', pill: null, byMe: false })),
        ...accepted
          .filter((r) => !inLibrary.has(r.id))
          .map((r) => ({ r, source: 'accepted', pill: null, byMe: true })),
      ]
        .filter(({ pill: p, byMe }) =>
          filter === 'all'
            ? true
            : filter === 'brain'
              ? p === null
              : filter === 'by-me'
                ? byMe
                : p === filter,
        )
        .map(({ r, source, pill: p, byMe }) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          icon: r.icon ?? null,
          summary: r.summary ?? null,
          updatedAt: r.updatedAt,
          source,
          pill: p,
          audience: source === 'library' || source === 'accepted' ? r.audience : null,
          author: (r.author as unknown) ?? null,
          byMe,
          space: source === 'own' || source === 'team' ? r : null,
        }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return json(res, 200, { items: rows, total: rows.length, page: 1, pageSize: 50 });
    }
    if (path === '/api/member/space' && method === 'GET') {
      const kind = url.searchParams.get('kind');
      const review = url.searchParams.get('review')?.split(',') ?? null;
      const held =
        state.withAdmin &&
        state.listWithAdmin &&
        (!kind || kind === 'page') &&
        (!review || review.includes('with-admin'))
          ? [spaceRow(TAKEN_ID, TAKEN_TITLE, 'with-admin')]
          : [];
      const own = (
        kind === 'page'
          ? [
              row(),
              ...(state.bundle
                ? [
                    spaceRow(HOLDER_ID, HOLDER_TITLE, 'submitted'),
                    spaceRow(BUNDLE_CHILD_ID, BUNDLE_CHILD_TITLE, 'draft'),
                  ]
                : []),
            ]
          : []
      ).filter((r) => !review || review.includes(r.reviewState));
      const items = [...held, ...own];
      return json(res, 200, { items, total: items.length, page: 1, pageSize: 20 });
    }
    if (state.bundle && path === `/api/member/space/${HOLDER_ID}` && method === 'GET') {
      return json(res, 200, {
        row: spaceRow(HOLDER_ID, HOLDER_TITLE, 'submitted'),
        body: pageBody(HOLDER_TITLE, 'The week.'),
      });
    }
    if (state.bundle && path === `/api/member/space/${BUNDLE_CHILD_ID}` && method === 'GET') {
      return json(res, 200, {
        row: spaceRow(BUNDLE_CHILD_ID, BUNDLE_CHILD_TITLE, 'draft'),
        body: pageBody(BUNDLE_CHILD_TITLE, 'Photos of the pump.'),
      });
    }
    if (state.bundle && path === `/api/member/space/${BUNDLE_CHILD_ID}/draft`) {
      await readBody(req);
      return json(res, 409, {
        error: `This item is part of "${HOLDER_TITLE}", which is submitted for review. Recall that item to make changes.`,
        reason: 'frozen',
        ids: [HOLDER_ID],
      });
    }
    if (path === `/api/member/space/${PAGE_ID}/submit` && method === 'POST') {
      if (state.submitUnsaved) {
        return json(res, 409, {
          error: `Items shown in this one have unsaved changes: "${BUNDLE_CHILD_TITLE}". Save a version of each, then submit.`,
          reason: 'unsaved-draft',
          ids: [BUNDLE_CHILD_ID],
        });
      }
      state.frozen = true;
      return json(res, 200, { item: row() });
    }
    if (path === `/api/member/space/${PAGE_ID}` && method === 'GET') {
      return json(res, 200, {
        row: row(),
        body: {
          type: 'page',
          page: { doc: PAGE_DOC, draft: state.draft, draftRev: state.draftRev, title: PAGE_TITLE },
        },
      });
    }
    if (path === `/api/member/space/${PAGE_ID}/draft` && method === 'PUT') {
      const body = JSON.parse(await readBody(req)) as { doc: Doc; if_rev?: number };
      state.puts.push({ ...body, at: Date.now() });
      if (state.failDrafts) return json(res, state.failDrafts, { error: 'Internal error' });
      if (state.frozen) {
        return json(res, 409, {
          error: 'Submitted for review: nobody can change it now. Recall it to make a correction.',
          reason: 'frozen',
        });
      }
      if (body.if_rev !== undefined && body.if_rev !== state.draftRev) {
        return json(res, 409, { error: 'The draft changed.', current_rev: state.draftRev });
      }
      state.draft = body.doc;
      state.draftRev += 1;
      return json(res, 200, { ok: true, draft_rev: state.draftRev });
    }
    if (state.libraryList && path === '/api/member/library' && method === 'GET') {
      const libRow = (id: string, title: string, audience: 'team' | 'client') => ({
        id,
        type: 'page',
        title,
        icon: null,
        summary: null,
        audience,
        updatedAt: now,
      });
      const items =
        url.searchParams.get('kind') === 'page'
          ? [
              libRow(LIBRARY_CLIENT_ID, LIBRARY_CLIENT_TITLE, 'client'),
              libRow(LIBRARY_ID, LIBRARY_TITLE, 'team'),
            ]
          : [];
      return json(res, 200, { items, total: items.length, page: 1, pageSize: 20 });
    }
    if (path === `/api/member/library/${LIBRARY_ID}` && method === 'GET') {
      return json(res, 200, {
        item: {
          id: LIBRARY_ID,
          type: 'page',
          title: LIBRARY_TITLE,
          icon: null,
          summary: null,
          audience: 'team',
          updatedAt: now,
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read me.' }] }],
          },
        },
      });
    }
    if (path === `/api/member/library/${LIBRARY_NOTE_ID}` && method === 'GET') {
      return json(res, 200, {
        item: {
          id: LIBRARY_NOTE_ID,
          type: 'note',
          title: LIBRARY_NOTE_TITLE,
          icon: null,
          summary: null,
          audience: 'team',
          updatedAt: now,
          content: 'Ask at the front desk.',
        },
      });
    }
    if (state.changedFile && path === '/api/member/accepted' && method === 'GET') {
      const items = url.searchParams.get('kind') === 'file' ? [changedFileRow()] : [];
      if (items.length) return json(res, 200, { items, total: 1, page: 1, pageSize: 20 });
    }
    if (state.changedFile && path === `/api/member/accepted/${CHANGED_FILE_ID}`) {
      return json(res, 200, {
        item: {
          ...changedFileRow(),
          filename: CHANGED_FILE_NAME,
          mimeType: 'image/png',
          sizeBytes: 2048,
          changedByAdmin: true,
        },
      });
    }
    if (path === `/api/member/files/${CHANGED_FILE_ID}`) {
      // The brain serves an accepted file's bytes only while they are the
      // ones accepted: this one an admin changed.
      state.memberAssetCalls.push(path);
      return json(res, 404, { error: 'Not found.' });
    }
    if (path === '/api/member/accepted' && method === 'GET') {
      const items = url.searchParams.get('kind') === 'page' ? [acceptedRow()] : [];
      return json(res, 200, { items, total: items.length, page: 1, pageSize: 20 });
    }
    if (path === `/api/member/accepted/${ACCEPTED_ID}` && method === 'GET') {
      return json(res, 200, {
        item: {
          ...acceptedRow(),
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved survey.' }] }],
          },
        },
      });
    }
    if (path.startsWith('/api/member/space/') && path.endsWith('/comments')) {
      return json(res, 200, { comments: [] });
    }
    if (path.startsWith('/api/member/files/')) {
      state.memberAssetCalls.push(path);
      return send(res, 200, 'image/png', PNG_1PX);
    }
    if (path.startsWith('/api/member/draws/')) {
      state.memberAssetCalls.push(path);
      return send(
        res,
        200,
        'image/svg+xml',
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      );
    }
    if (path === '/api/version') return json(res, 200, state.version);
    // Anything else: a plain 404, never a 401 (that would bounce to /login).
    return json(res, 404, { error: `not mocked: ${method} ${path}` });
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => json(res, 500, { error: String(err) }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(MOCK_API_PORT, '127.0.0.1', () => resolve());
  });
  state.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return state;
}
