/**
 * The ONE workspace screen (W5a, plan 1.4): a Moderator (or a login with the
 * users area) gets the controls; a plain user reads the same sections with
 * none. Within the controls the contact is an Admin user's, the assistant
 * needs the Assistants area and an Admin user's Moderator row is an Admin
 * user's. Every connector row takes its controls, Admin and Team too
 * (contract 24). The no-magic lines (plan 21.8) show when they apply.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { TeamSettings } from '@/components/workspaces/team-settings-query';
import { ToastProvider } from '@mantle/web-ui/ui/toast';
import {
  ADMIN_ADD_TEXT,
  ADMIN_MODERATED_TEXT,
  BUILT_IN_NAME_HINT,
  HAS_HISTORY_TEXT,
  REMOVE_ADMIN_KEPT_TEXT,
  REMOVE_SELF_ADMIN_TEXT,
  workspaceKey,
  type Workspace,
  type WorkspaceDetail,
} from '@/lib/workspaces';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings/workspaces' }));

const { WorkspaceScreen, WorkspaceSections } = await import('./workspace-screen');
const { TEAM_SETTINGS_KEY } = await import('@/components/workspaces/team-settings-query');
const { NO_TEAM_ASSISTANT_TEXT } = await import('@/lib/team-assistant');

function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w-team',
    name: 'Team',
    description: 'Everyone at the firm',
    contactNodeId: null,
    assistant: { id: 'ag1', name: 'Team assistant' },
    isAdmin: false,
    adminModerated: true,
    // Not built in: the sections below test the controls of a workspace that
    // may be renamed, archived and given connectors. Built-ins are tested on
    // their own further down.
    builtIn: false,
    archived: false,
    userCount: 2,
    resourceCount: 1,
    me: { member: true, moderator: true },
    ...over,
  };
}

function detail(over: Partial<Workspace> = {}, extra: Partial<WorkspaceDetail> = {}) {
  return {
    workspace: ws(over),
    users: [
      {
        loginId: 'l-ann',
        name: 'Ann Lee',
        email: 'ann@x.test',
        moderator: true,
        adminViaArea: false,
        addedBy: { loginId: 'l-own', name: 'Owner' },
        addedAt: '2026-10-10T09:00:00.000Z',
      },
      {
        loginId: 'l-bo',
        name: null,
        email: 'bo@x.test',
        moderator: false,
        adminViaArea: false,
        addedBy: null,
        addedAt: '2026-10-10T09:00:00.000Z',
      },
      {
        loginId: 'l-own',
        name: 'Owner',
        email: 'own@x.test',
        moderator: false,
        adminViaArea: true,
        addedBy: null,
        addedAt: '2026-10-10T09:00:00.000Z',
      },
    ],
    resources: [
      { kind: 'connector', id: 'drive', name: 'Drive', write: true },
      { kind: 'connector', id: 'mail', name: 'Mail', write: true },
    ],
    hasHistory: true,
    ...extra,
  } satisfies WorkspaceDetail;
}

function render(el: React.ReactElement, seed?: (c: QueryClient) => void): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(client);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(ToastProvider, null, el),
    }),
  );
}

const ADMIN_AREAS = ['settings', 'users', 'assistants', 'connectors', 'keys'];

const options = (c: QueryClient) => {
  c.setQueryData(
    ['workspaces', 'assistant-options'],
    [{ id: 'ag1', name: 'Team assistant', role: 'responder' }],
  );
  c.setQueryData(
    ['workspaces', 'connector-options'],
    [
      { slug: 'drive', name: 'Drive' },
      { slug: 'mail', name: 'Mail' },
      { slug: 'crm', name: 'CRM' },
    ],
  );
};

describe('WorkspaceSections, Admin user view', () => {
  const html = render(
    createElement(WorkspaceSections, { detail: detail(), manage: true, areas: ADMIN_AREAS }),
    (c) => {
      c.setQueryData(
        ['workspaces', 'assistant-options'],
        [{ id: 'ag1', name: 'Team assistant', role: 'responder' }],
      );
      c.setQueryData(
        ['workspaces', 'connector-options'],
        [
          { slug: 'drive', name: 'Drive' },
          { slug: 'crm', name: 'CRM' },
        ],
      );
    },
  );

  it('edits name, description and contact', () => {
    expect(html).toContain('id="workspace-name"');
    expect(html).toContain('value="Team"');
    expect(html).toContain('id="workspace-description"');
    expect(html).toContain('Contact (optional)');
    expect(html).toContain('placeholder="Search contacts"');
    expect(html).toContain('Information only: it gives nobody access.');
  });

  it('says that Admin users moderate it', () => {
    expect(html).toContain(ADMIN_MODERATED_TEXT);
  });

  it('a Moderator tick per user; an Admin user kept in Team is fixed, even for an Admin user', () => {
    expect(html).toContain('id="workspace-moderator-l-ann"');
    expect(html).toContain('id="workspace-moderator-l-bo"');
    expect(html).toContain('Moderator (Admin user)');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="workspace-moderator-l-own"/);
    expect(html).toContain('aria-label="Remove Ann Lee"');
    expect(html).toContain('aria-label="Remove bo@x.test"');
    expect(html).not.toContain('aria-label="Remove Owner"');
    // Its Remove keeps its slot, dimmed and off, saying why (task 19790beb).
    expect(html).toMatch(
      new RegExp(`disabled=""[^>]*aria-label="Remove Owner: ${REMOVE_ADMIN_KEPT_TEXT}"`),
    );
    expect(html).toContain(`title="${REMOVE_ADMIN_KEPT_TEXT}"`);
  });

  it('every user row keeps the same trailing slot, so the ticks line up (task 19790beb)', () => {
    const rows = html.split('data-testid="workspace-user"').slice(1);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      // The fixed-width tick cell, then the Remove slot.
      expect(row).toMatch(/class="flex w-44 shrink-0 items-center gap-2"/);
      expect(row).toMatch(/aria-label="Remove /);
    }
  });

  it('picks a colour and icon with the folder picker (task 5edc9149)', () => {
    expect(html).toContain('id="workspace-look"');
    expect(html).toContain('Change colour and icon');
    expect(html).toContain('Shown in the workspace switcher and on the share marks of items.');
  });

  it('says who added each user, and when', () => {
    expect(html).toMatch(/Added by Owner on [^<]+</);
    expect(html).toMatch(/Added on [^<]+</);
  });

  it('adds users by search, the full list without typing', () => {
    expect(html).toContain('Add a user');
    expect(html).toContain('placeholder="Search by name or email"');
    expect(html).toContain('Type to narrow the list.');
  });

  it('the assistant has history: shown, and the picker is fixed', () => {
    expect(html).toContain('id="workspace-assistant-pick"');
    expect(html).toContain(HAS_HISTORY_TEXT);
    expect(html).toMatch(/<button[^>]*id="workspace-assistant-pick"/);
    expect(html).toMatch(/role="combobox"[^>]*disabled=""[^>]*id="workspace-assistant-pick"/);
  });

  it('lists connectors with a Write tick, and offers the ones not added', () => {
    expect(html).toContain('id="workspace-write-connector-drive"');
    expect(html).toContain('aria-label="Remove Drive"');
    expect(html).toContain('Add a connector');
  });

  it('every connector row has its Write tick and Remove (no bridge lock)', () => {
    expect(html).toContain('id="workspace-write-connector-mail"');
    expect(html).toContain('aria-label="Remove Mail"');
    expect(html).not.toMatch(/connector level/);
  });

  it('no em or en dashes in the screen', () => {
    expect(html).not.toMatch(new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`));
  });
});

describe('WorkspaceSections, Moderator (not an Admin user) view', () => {
  const html = render(
    createElement(WorkspaceSections, {
      detail: detail({}, { hasHistory: false }),
      manage: true,
      areas: [],
    }),
    options,
  );

  it('edits name and description; the contact is text', () => {
    expect(html).toContain('id="workspace-name"');
    expect(html).not.toContain('placeholder="Search contacts"');
    expect(html).toContain('An Admin user sets it.');
  });

  it('the Admin-user row is fixed for them', () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="workspace-moderator-l-own"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*id="workspace-moderator-l-bo"/);
    expect(html).not.toContain('aria-label="Remove Owner"');
    expect(html).toContain('aria-label="Remove bo@x.test"');
  });

  it('searches from three letters', () => {
    expect(html).toContain('Type at least 3 letters.');
  });

  it('reads the assistant, does not pick it', () => {
    expect(html).not.toContain('id="workspace-assistant-pick"');
    expect(html).toContain('Team assistant');
  });

  it('reads the connectors: setting them needs the Connectors area', () => {
    expect(html).toContain('Drive');
    expect(html).not.toContain('id="workspace-write-connector-drive"');
    expect(html).not.toContain('Add a connector');
  });
});

describe('WorkspaceSections, plain user view', () => {
  const html = render(
    createElement(WorkspaceSections, {
      detail: detail({ me: { member: true, moderator: false }, adminModerated: false }),
      manage: false,
      areas: [],
    }),
  );

  it('reads the same sections', () => {
    expect(html).toContain('Everyone at the firm');
    expect(html).toContain('Ann Lee');
    expect(html).toContain('Team assistant');
    expect(html).toContain('Drive');
  });

  it('has no controls', () => {
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain('aria-label="Remove');
    expect(html).not.toContain('Add a user');
    expect(html).not.toContain('Add a connector');
  });

  it('shows who moderates, and Write as a word', () => {
    expect(html).toContain('>Moderator<');
    expect(html).toContain('>Write<');
  });

  it('a set contact reads as set, with no request for it (contacts are an Admin screen)', () => {
    const client = new QueryClient();
    const out = renderToStaticMarkup(
      createElement(QueryClientProvider, {
        client,
        children: createElement(
          ToastProvider,
          null,
          createElement(WorkspaceSections, {
            detail: detail({ me: { member: true, moderator: false }, contactNodeId: 'c1' }),
            manage: false,
            areas: [],
          }),
        ),
      }),
    );
    expect(out).toContain('Set by an Admin user');
    const contactQuery = client.getQueryCache().find({ queryKey: ['contacts', 'one', 'c1'] });
    expect(contactQuery?.state.fetchStatus ?? 'idle').toBe('idle');
    expect(contactQuery?.state.data).toBeUndefined();
  });

  it('leaves out the Admin-moderated line when it does not apply', () => {
    expect(html).not.toContain(ADMIN_MODERATED_TEXT);
  });
});

describe('WorkspaceSections, the Admin workspace', () => {
  it('says that a user added here is an Admin user', () => {
    const html = render(
      createElement(WorkspaceSections, {
        detail: detail({ id: 'w-admin', name: 'Admin', isAdmin: true, adminModerated: false }),
        manage: true,
        areas: ADMIN_AREAS,
      }),
      options,
    );
    expect(html).toContain(ADMIN_ADD_TEXT);
  });
});

describe('WorkspaceScreen header', () => {
  const seed = (d: WorkspaceDetail) => (c: QueryClient) =>
    c.setQueryData(workspaceKey(d.workspace.id), d);

  it('a Moderator of a plain workspace gets Archive', () => {
    const d = detail();
    const html = render(
      createElement(WorkspaceScreen, { workspace: d.workspace, areas: [], onArchived: () => {} }),
      seed(d),
    );
    expect(html).toContain('aria-label="Archive workspace"');
    expect(html).toContain('>Moderator<');
  });

  it('Admin has no Archive, even for the users area', () => {
    const d = detail({
      id: 'w-admin',
      name: 'Admin',
      isAdmin: true,
      adminModerated: false,
      builtIn: undefined,
    });
    const html = render(
      createElement(WorkspaceScreen, {
        workspace: d.workspace,
        areas: ['users'],
        onArchived: () => {},
      }),
      seed(d),
    );
    expect(html).not.toContain('aria-label="Archive workspace"');
    expect(html).toContain('>Admin<');
  });

  it('a plain user gets no Archive and no controls', () => {
    const d = detail({ me: { member: true, moderator: false } });
    const html = render(
      createElement(WorkspaceScreen, {
        workspace: d.workspace,
        areas: ['settings'],
        onArchived: () => {},
      }),
      seed(d),
    );
    expect(html).not.toContain('aria-label="Archive workspace"');
    expect(html).not.toContain('role="checkbox"');
  });

  it('an archived workspace is read only, with its pill', () => {
    const d = detail({ archived: true });
    const html = render(
      createElement(WorkspaceScreen, {
        workspace: d.workspace,
        areas: ['users'],
        onArchived: () => {},
      }),
      seed(d),
    );
    expect(html).toContain('>Archived<');
    expect(html).not.toContain('aria-label="Archive workspace"');
    expect(html).not.toContain('role="checkbox"');
  });
});

describe('built-in workspaces (Admin and Team)', () => {
  const seed = (d: WorkspaceDetail) => (c: QueryClient) => {
    c.setQueryData(workspaceKey(d.workspace.id), d);
    options(c);
  };
  // Team from a brain before contract change 20 (no builtIn): the fallback.
  const team = detail({ builtIn: undefined, adminModerated: true });
  // Team as the brain sends it after change 20.
  const teamNow = detail({ builtIn: true, adminModerated: true });
  const admin = detail({
    id: 'w-admin',
    name: 'Admin',
    isAdmin: true,
    adminModerated: false,
    builtIn: undefined,
  });

  for (const [label, d] of [
    ['Team (fallback)', team],
    ['Team (builtIn)', teamNow],
    ['Admin (fallback)', admin],
  ] as const) {
    it(`${label}: no Archive, the name is read only, connectors as any workspace`, () => {
      const html = render(
        createElement(WorkspaceScreen, {
          workspace: d.workspace,
          areas: ADMIN_AREAS,
          onArchived: () => {},
        }),
        seed(d),
      );
      expect(html).not.toContain('aria-label="Archive workspace"');
      expect(html).toMatch(/<input[^>]*id="workspace-name"[^>]*readOnly=""/);
      expect(html).toContain(BUILT_IN_NAME_HINT);
      // Contract 24: Admin and Team attach connectors here like any other.
      expect(html).toContain('Add a connector');
      expect(html).toContain('aria-label="Remove Mail"');
      expect(html).not.toMatch(/connector level/);
    });
  }

  const teamWith = (teamAssistant: TeamSettings['teamAssistant']) =>
    render(
      createElement(WorkspaceScreen, {
        workspace: teamNow.workspace,
        areas: ADMIN_AREAS,
        onArchived: () => {},
      }),
      (c) => {
        seed(teamNow)(c);
        c.setQueryData<TeamSettings>(TEAM_SETTINGS_KEY, {
          privateReads: false,
          teamAssistant,
        });
      },
    );

  it('Team ends with the Team settings for an Admin user', () => {
    const html = teamWith({ slug: 'team-responder', name: 'Team agent', workspaceId: 'ws-team' });
    for (const t of ['Member chat', 'Read posture']) {
      expect(html).toContain(`>${t}</h3>`);
    }
    // The member home app moved to every workspace's Landing page.
    expect(html).not.toContain('Member home app');
    // W5c: the Team assistant's name, a link to it, and no level to set.
    expect(html).toContain('Members chat with');
    expect(html).toContain('href="/settings/agents?selected=team-responder"');
    expect(html).toContain('>Team agent</a>');
    expect(html).not.toMatch(/Let members chat|Stop member chat|Team level/);
    expect(html).toContain('Expose email &amp; journal');
  });

  it('Team says so plainly when it has no assistant', () => {
    const html = teamWith(null);
    expect(html).toContain(NO_TEAM_ASSISTANT_TEXT);
    expect(html).not.toMatch(/Let members chat|Stop member chat/);
  });

  it('Team shows no Team settings to a Moderator without the settings area', () => {
    const html = render(
      createElement(WorkspaceScreen, {
        workspace: teamNow.workspace,
        areas: ['users'],
        onArchived: () => {},
      }),
      seed(teamNow),
    );
    expect(html).not.toContain('Member chat');
    expect(html).not.toContain('Read posture');
  });

  it('Admin and a plain workspace show no Team settings', () => {
    for (const d of [admin, detail({ builtIn: false, adminModerated: false })]) {
      const html = render(
        createElement(WorkspaceScreen, {
          workspace: d.workspace,
          areas: ADMIN_AREAS,
          onArchived: () => {},
        }),
        seed(d),
      );
      expect(html).not.toContain('Member home app');
    }
  });

  it('a workspace that is not built in keeps its name field and Archive', () => {
    const d = detail({ builtIn: false, adminModerated: false });
    const html = render(
      createElement(WorkspaceScreen, {
        workspace: d.workspace,
        areas: ADMIN_AREAS,
        onArchived: () => {},
      }),
      seed(d),
    );
    expect(html).toContain('aria-label="Archive workspace"');
    expect(html).not.toMatch(/<input[^>]*id="workspace-name"[^>]*readOnly=""/);
    expect(html).not.toContain(BUILT_IN_NAME_HINT);
    expect(html).toContain('Add a connector');
  });
});

describe('the Admin workspace: your own row', () => {
  it('has no Remove for the viewer; other Admin users keep theirs', () => {
    const d = detail(
      { id: 'w-admin', name: 'Admin', isAdmin: true, adminModerated: false },
      {
        users: [
          {
            loginId: 'l-me',
            name: 'Me',
            email: 'Me@X.test',
            moderator: true,
            adminViaArea: false,
            addedBy: null,
            addedAt: '2026-10-10T09:00:00.000Z',
          },
          {
            loginId: 'l-other',
            name: 'Other',
            email: 'other@x.test',
            moderator: true,
            adminViaArea: false,
            addedBy: null,
            addedAt: '2026-10-10T09:00:00.000Z',
          },
        ],
      },
    );
    const html = render(
      createElement(WorkspaceSections, { detail: d, manage: true, areas: ADMIN_AREAS }),
      (c) => {
        c.setQueryData(['shell'], { email: 'me@x.test', areas: ADMIN_AREAS, workspaces: [] });
        options(c);
      },
    );
    expect(html).not.toContain('aria-label="Remove Me"');
    expect(html).toContain(`aria-label="Remove Me: ${REMOVE_SELF_ADMIN_TEXT}"`);
    expect(html).toContain('aria-label="Remove Other"');
  });
});

describe('user search on screen open', () => {
  it('sends nothing until the add-user picker opens, the empty Admin search included', () => {
    const client = new QueryClient();
    options(client);
    renderToStaticMarkup(
      createElement(QueryClientProvider, {
        client,
        children: createElement(
          ToastProvider,
          null,
          createElement(WorkspaceSections, { detail: detail(), manage: true, areas: ADMIN_AREAS }),
        ),
      }),
    );
    const search = client
      .getQueryCache()
      .find({ queryKey: ['workspaces', 'user-search'], exact: false });
    expect(search).toBeDefined();
    expect(search!.isDisabled()).toBe(true);
    expect(search!.state.data).toBeUndefined();
  });
});

describe('the Landing page section (task d78e7bde)', () => {
  const app = { held: true, appId: 'app1', title: 'Desk', ready: true };
  const html = (over: Partial<Workspace>, landingApp?: WorkspaceDetail['landingApp']) =>
    render(
      createElement(WorkspaceSections, {
        detail: { ...detail(over), ...(landingApp === undefined ? {} : { landingApp }) },
        manage: true,
        areas: ADMIN_AREAS,
      }),
      (c) => {
        options(c);
        c.setQueryData(['member-home', 'landing', 'w-team'], {
          ws: 'w-team',
          homeApp: null,
          hub: { sections: [], counts: {}, apps: [{ token: 'app2', title: 'Board' }] },
        });
      },
    );

  it('a Moderator picks it', () => {
    const out = html({}, app);
    expect(out).toContain('>Landing page</h3>');
    expect(out).toContain('aria-label="Landing page"');
    // The choices themselves: landingChoices below (a closed Select renders
    // none on the server).
  });

  it('anyone else reads it, an Admin user with every area too', () => {
    const out = html({ me: { member: true, moderator: false } }, app);
    expect(out).toContain('>Landing page</h3>');
    expect(out).not.toContain('aria-label="Landing page"');
    expect(out).toContain('>Desk</p>');
    expect(html({ me: { member: false, moderator: false } }, null)).toContain('>Built-in home</p>');
  });

  it('says when the app has no working build', () => {
    const out = html({ me: { member: true, moderator: false } }, { ...app, ready: false });
    expect(out).toContain('no working build');
  });

  it('an Admin user outside the workspace reads that one is set, not which', () => {
    const out = html(
      { me: { member: false, moderator: false } },
      { held: true, appId: null, title: null, ready: true },
    );
    expect(out).toContain('>A home app</p>');
  });

  it('an app the workspace no longer holds is named as such, with no title', () => {
    const out = html(
      { me: { member: true, moderator: false } },
      { held: false, appId: null, title: null, ready: false },
    );
    expect(out).toContain('no longer holds');
  });

  it('an older brain sends none: no section', () => {
    expect(html({})).not.toContain('Landing page');
  });
});

const { landingChoices, landingValue, BUILT_IN_HOME, UNNAMED_HOME } =
  await import('@/components/workspaces/landing-section');

describe('landingChoices', () => {
  it('the Built-in home first, then the current app, then the others once', () => {
    expect(
      landingChoices({ held: true, appId: 'a', title: 'A', ready: true }, [
        { token: 'b', title: 'B' },
        { token: 'a', title: 'A' },
      ]).map((c) => c.value),
    ).toEqual([BUILT_IN_HOME, 'a', 'b']);
    expect(landingChoices(null, []).map((c) => c.value)).toEqual([BUILT_IN_HOME]);
  });

  it('a pointer the workspace no longer holds is its own choice, so the Built-in pick clears it', () => {
    const stale = { held: false, appId: null, title: null, ready: false };
    expect(landingValue(stale)).toBe(UNNAMED_HOME);
    expect(landingChoices(stale, [{ token: 'b', title: 'B' }]).map((c) => c.value)).toEqual([
      BUILT_IN_HOME,
      UNNAMED_HOME,
      'b',
    ]);
    expect(landingValue(null)).toBe(BUILT_IN_HOME);
  });

  it('a landing app with no `held` field counts as held (audit L-c)', () => {
    const noHeld = { appId: 'a', title: 'A', ready: true } as unknown as Parameters<
      typeof landingValue
    >[0];
    expect(landingValue(noHeld)).toBe('a');
    expect(landingChoices(noHeld, [{ token: 'b', title: 'B' }])).toEqual([
      { value: BUILT_IN_HOME, label: 'Built-in home' },
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
  });
});
