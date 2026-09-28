import type { Tour } from './model';

/**
 * The tours this build knows. A deployment names one in `MANTLE_TOUR` (it
 * opens once per browser); `?tour=<id>` opens one on demand.
 *
 * Targets are `data-tour` attributes on the shell — `brand`, `profile`,
 * `assistant`, `help`, `main`, `activity`, and `nav:<href>` for every rail
 * item. A step whose target is not on screen (a collapsed rail, a scope that
 * hides the item) still renders: the card centres and says its piece.
 */

/**
 * The public demo. Written for a visitor who has never seen Mantle, and it
 * tells one story in three movements rather than naming screens:
 *
 *   1. everything you add is learned, automatically, and the brain knows
 *      itself (the dashboard, then files, mail and pages as the ways in);
 *   2. you ask with that context behind you (search, the agent, and the
 *      audit of a real answer with the passages it was built from);
 *   3. you steer the intelligence toward automation (agents and their tool
 *      groups, then MCP, where any client reaches the same brain).
 *
 * The demo is read-only, so no stop invites the visitor to add anything: each
 * one SHOWS the result of that step on seeded content and says what they
 * would do on a brain of their own. Every claim must be TRUE of the demo
 * brain in particular — it is generated, the assistant's turns are refused
 * at the edge, and the MCP connector is off — and the tour says so rather
 * than inviting a visitor to try something that cannot work. The rail's
 * default scope is Work, so stops on Settings and System screens frame the
 * content area rather than a rail item that is not on screen.
 */
const demo: Tour = {
  id: 'demo',
  title: 'A first look at Jackdaw',
  steps: [
    {
      route: '/',
      target: 'brand',
      title: 'Welcome to the Jackdaw demo',
      body: 'You are looking at a real Mantle brain: the working memory of Harbour Labs, a fictional five-person engineering studio. Everything in it is generated, and the demo is read-only, so look anywhere and change nothing.',
    },
    {
      route: '/',
      target: 'main',
      title: 'A brain that knows itself',
      body: 'The notes, mail, files and tables the studio added are the top line; the facts, people and connections beneath them were extracted by the brain on its own, with nothing tagged or filed by hand. On your own brain this screen starts empty and fills as you add things.',
      side: 'left',
    },
    {
      route: '/files',
      target: 'nav:/files',
      title: 'Start with what you already have',
      body: 'Drop in drawings, reports, spreadsheets and photos: each one is read, summarised and indexed the moment it lands, and the people and facts inside it join the brain without any sorting on your part. Every file here went through exactly that.',
    },
    {
      route: '/inbox',
      target: 'nav:/inbox',
      title: 'Mail is learned the same way',
      body: 'Connect a mailbox and every thread is ingested, classified and searchable beside everything else, with marketing down-weighted so it never crowds out a real conversation. The store 214 snag dispute, certificate withheld and all, arrived here as ordinary email.',
    },
    {
      route: '/pages',
      target: 'nav:/pages',
      title: 'Write, and the brain keeps up',
      body: 'Pages are living documents with revision families: open the PS3 changeover procedure to watch revision A give way to B and C, and the brain knows which one is current when it answers. Tables sit beside them, typed columns, formulas and aggregates included.',
    },
    {
      route: '/',
      target: 'profile',
      title: 'Ask it anything, the quick way',
      body: 'Search everywhere (⌘K, or Ctrl+K) lives under this menu and reaches notes, pages, mail, files and tables in one query, ranked by meaning rather than by keyword. Try "loop check order" and watch an email thread, a task, a note and the procedure itself answer together.',
    },
    {
      route: '/',
      target: 'assistant',
      title: 'Then ask the agent',
      body: "Saskia, the studio's assistant, reads the brain before answering, runs tools to do real work, and asks before anything irreversible. This public demo refuses writes, so its turns are switched off here; the next stop shows what it answered while they were on.",
    },
    {
      // The context audit lives under Debug, which the Work scope keeps off
      // the rail, so this stop frames the screen itself.
      route: '/debug/context',
      target: 'main',
      title: 'Every answer is grounded, and you can see how',
      body: 'Each row is a real question asked of this brain, the passages retrieved to answer it, and the reply that came back. Nothing the agent says is a black box: the context it was given sits beside the answer it gave.',
      side: 'left',
    },
    {
      route: '/settings/agents',
      target: 'main',
      title: 'One brain, several agents',
      body: 'Saskia is the generalist; Ledger works tables, Pages writes documents, Remy recalls, Toolsmith builds new tools, and each is a persona, a model and a set of tool groups you can change here. The memory is shared; the jobs are not.',
      side: 'left',
    },
    {
      route: '/settings/mcp',
      target: 'main',
      title: 'Steer it toward automation with MCP',
      body: 'Switch the connector on and this brain becomes an MCP server: add it to Claude on the web, desktop or phone and it works with the same tools and the same memory the agents have, so the automation you build there starts from everything already learned here. It is off on the public demo; on your own brain it is one toggle.',
      side: 'left',
    },
    {
      route: '/',
      target: 'help',
      title: 'Every screen explains itself',
      body: 'The ? panel describes whichever screen you are on, and the Settings and Admin scopes above the rail show the rest of the map. That is the tour; explore freely, nothing you click can change this brain.',
    },
  ],
};

/**
 * A member login's first look (member logins, Phase 5). It opens once per
 * browser on the member home, and `?tour=member` opens it again. Every claim
 * has to hold on any brain a member signs in to, so it names what a member
 * can do, never what this brain contains. Targets: the member rail
 * (`nav:<href>`, `nav:#chat` for the chat item), the source picker on a
 * workspace list (`member-sources`), and the shell's `brand`, `main` and
 * `profile`.
 */
const member: Tour = {
  id: 'member',
  title: 'Your first look',
  steps: [
    {
      route: '/',
      target: 'brand',
      title: 'Welcome',
      body: "This is your team's brain, and part of it is yours alone. What you write stays private until you share it with the team or send it to an admin.",
    },
    {
      route: '/',
      target: 'main',
      title: 'Your home',
      body: 'Home shows what came back from review, what is waiting for review, and what is new in the team. If an admin set a team app as home, it opens here, and My work switches to this view.',
      side: 'left',
    },
    {
      route: '/pages',
      target: 'nav:/pages',
      title: 'Pages, notes, drawings, tables and files',
      body: 'Each works the same way. Start in Mine: anything new you make is private to you.',
    },
    {
      route: '/pages',
      target: 'member-sources',
      title: 'Whose items',
      body: 'Team drafts are what teammates shared with the team, and the Library is what the brain holds for the team. Accepted is your own work that an admin moved into the brain; you can still read it there.',
    },
    {
      route: '/pages',
      title: 'Share, or send for review',
      body: 'Open one of your own items to set it Private or Team, or to Submit it to an admin. The admin accepts it into the brain or returns it to you with a note.',
    },
    {
      route: '/apps',
      target: 'nav:/apps',
      title: 'Apps',
      body: 'Apps an admin published for the team run here. What you enter in one is shared with the team, not kept in your private space.',
    },
    {
      route: '/',
      target: 'nav:#chat',
      title: 'Chat',
      body: 'Ask the team assistant about anything shared with the team; it can also open your own items when you ask. Admins never read a reply that used your private items.',
    },
    {
      route: '/',
      target: 'profile',
      title: 'Your account',
      body: 'Change your password and the look of the app here, and sign out when you are done on a shared computer. Take this tour again from the same menu.',
      side: 'top',
    },
  ],
};

/** The id of the member tour: the one tour a member login is shown. */
export const MEMBER_TOUR_ID = member.id;

export const TOURS: Readonly<Record<string, Tour>> = { demo };

/** The tours an admin (owner UI) knows. Never the member tour: it walks the
 *  member rail, which an admin does not have. */
export const tourById = (id: string): Tour | null => TOURS[id] ?? null;

/** The tours a member knows: only their own. The demo and any deployment tour
 *  walk admin screens a member is kept off, so for a member they name no
 *  tour and start nothing. */
export const memberTourById = (id: string): Tour | null => (id === member.id ? member : null);

/**
 * Which tours a viewer knows, and which one opens by itself (once per
 * browser, on its first screen). An admin gets the deployment's MANTLE_TOUR;
 * a member gets the member tour and never the deployment's, whose stops are
 * admin screens; a client login, or a viewer whose role is not known yet,
 * gets none. Without this split a member on a `?tour=demo` link got a
 * tour with no card (the overlay was admin-only) that kept pushing them back
 * to its first screen.
 */
export function toursFor(
  role: 'admin' | 'member' | 'client' | null,
  deploymentTour: string | null,
): { byId: (id: string) => Tour | null; autoTour: string | null } {
  // Each role by name: anyone else (a client login, or no role yet) knows
  // no tour at all, and never the admin's.
  if (role === 'admin') return { byId: tourById, autoTour: deploymentTour };
  if (role === 'member') return { byId: memberTourById, autoTour: MEMBER_TOUR_ID };
  return { byId: () => null, autoTour: null };
}
