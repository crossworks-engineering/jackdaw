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
import { ToastProvider } from '@mantle/web-ui/ui/toast';
import {
  ADMIN_ADD_TEXT,
  ADMIN_MODERATED_TEXT,
  BUILT_IN_NAME_HINT,
  HAS_HISTORY_TEXT,
  workspaceKey,
  type Workspace,
  type WorkspaceDetail,
} from '@/lib/workspaces';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings/workspaces' }));

const { WorkspaceScreen, WorkspaceSections } = await import('./workspace-screen');

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
