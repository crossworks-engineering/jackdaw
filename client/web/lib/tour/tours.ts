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
 * The public demo. Written for a visitor who has never seen Mantle: nine
 * stops, each a sentence or two, in the order a first look actually goes —
 * what this is, where the content lives, then the three things that make it
 * a brain rather than a filing cabinet (search, the assistant, the traces).
 *
 * Every claim must be TRUE of the demo brain in particular: it is generated,
 * read-only, and the assistant's turns are refused at the edge — the tour
 * says so rather than inviting a visitor to try something that cannot work.
 */
const demo: Tour = {
  id: 'demo',
  title: 'A first look at Jackdaw',
  steps: [
    {
      route: '/',
      target: 'brand',
      title: 'Welcome to the Jackdaw demo',
      body: 'You are looking at a real Mantle brain — the working memory of Harbour Labs, a fictional five-person engineering studio. Everything in it is generated, and the demo is read-only: look anywhere, change nothing.',
    },
    {
      route: '/',
      target: 'main',
      title: 'The dashboard',
      body: 'Brain health at a glance: what has been ingested, what the assistant has done, and what is waiting on the owner.',
      side: 'left',
    },
    {
      route: '/pages',
      target: 'nav:/pages',
      title: 'Pages',
      body: 'Living documents, with revision families. Open the PUMPHOUSE procedure changelog to see revision A give way to B and C — the brain knows which one is current.',
    },
    {
      route: '/tables',
      target: 'nav:/tables',
      title: 'Tables',
      body: 'Typed columns, formulas and aggregates. A retail fit-out pipeline and a lathe restoration budget sit in the same brain, because a whole life does.',
    },
    {
      route: '/inbox',
      target: 'nav:/inbox',
      title: 'Email lands here too',
      body: 'Mail is ingested, classified and searchable beside everything else. Marketing is down-weighted so it never crowds out a real conversation.',
    },
    {
      route: '/traces',
      target: 'nav:/traces',
      title: 'Every assistant turn leaves a trace',
      body: 'The prompt, the passages it retrieved, every tool it called — step by step. Nothing the assistant does is a black box.',
    },
    {
      route: '/',
      target: 'profile',
      title: 'Search everything',
      body: 'Account, appearance and search live under this menu. One query (⌘K) reaches notes, pages, mail, files and tables at once, ranked by meaning rather than by keyword.',
    },
    {
      route: '/',
      target: 'assistant',
      title: 'The assistant',
      body: 'Ask it to do real work: it reads the brain, runs tools, and asks before anything irreversible. This public demo refuses writes, so its turns are switched off here.',
    },
    {
      route: '/',
      target: 'help',
      title: 'Every screen explains itself',
      body: 'The ? panel describes whichever screen you are on. That is the tour — explore freely; nothing you click can change this brain.',
    },
  ],
};

export const TOURS: Readonly<Record<string, Tour>> = { demo };

export const tourById = (id: string): Tour | null => TOURS[id] ?? null;
