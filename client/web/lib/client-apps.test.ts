import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  CLIENT_APPS_KEY,
  CLIENT_APPS_ROUTE,
  clientAppBase,
  clientAppHref,
  clientAppProblem,
  clientAppSandboxProps,
  clientAppsEmpty,
  filterClientApps,
  findClientApp,
  showsClientApps,
  type ClientAppCard,
} from './client-apps';
import {
  askUnlessMissing,
  clientViewOf,
  forgetMissingRoutes,
  isMissingRoute,
} from './client-requests';
import { refreshClientPortal } from './client-portal';
import { memberAppSandboxProps } from './member-apps';

/**
 * A client's apps (client logins C6): the client routes (never the member or
 * owner ones), the Apps screen at the portal's one path, the rail's rule
 * (only with apps), and an older brain asked once.
 */
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const card = (over: Partial<ClientAppCard> = {}): ClientAppCard => ({
  id: ID,
  title: 'Snag list',
  icon: null,
  color: null,
  description: 'Open items on site',
  updatedAt: '2026-09-30T08:00:00.000Z',
  dataReadOnly: false,
  ...over,
});

describe('the client app routes', () => {
  it('runs an app over the client prefix, id encoded', () => {
    expect(CLIENT_APPS_ROUTE).toBe('/api/client/apps');
    expect(clientAppBase(ID)).toBe(`/api/client/apps/${ID}`);
    expect(clientAppBase('a/b')).toBe('/api/client/apps/a%2Fb');
  });

  it('gives the sandbox the client base, not the member or owner one', () => {
    const props = clientAppSandboxProps(ID);
    expect(props.apiBase.endsWith(`/api/client/apps/${ID}`)).toBe(true);
    expect(props.apiBase).not.toMatch(/\/api\/(member\/)?apps\//);
    expect(props.apiBase).not.toBe(memberAppSandboxProps(ID).apiBase);
    expect(typeof props.fetcher).toBe('function');
  });

  it('opens an app on the Apps screen, at the one client path', () => {
    expect(clientAppHref(ID)).toBe(`/?view=apps&id=${ID}`);
    expect(clientAppHref('a&b')).toBe('/?view=apps&id=a%26b');
    const sp = new URLSearchParams(clientAppHref(ID).slice(2));
    expect(clientViewOf(sp)).toBe('apps');
    expect(sp.get('id')).toBe(ID);
  });
});

describe('the rail and the launcher', () => {
  it('shows Apps only for a brain that listed at least one', () => {
    expect(showsClientApps({ apps: [card()] })).toBe(true);
    expect(showsClientApps({ apps: [] })).toBe(false);
    expect(showsClientApps(undefined)).toBe(false);
    expect(showsClientApps(null)).toBe(false);
  });

  it('finds the app a URL names, any case; nothing else', () => {
    const list = { apps: [card()] };
    expect(findClientApp(list, ID)?.title).toBe('Snag list');
    expect(findClientApp(list, ID.toUpperCase())?.id).toBe(ID);
    expect(findClientApp(list, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBeNull();
    expect(findClientApp(list, null)).toBeNull();
    expect(findClientApp(undefined, ID)).toBeNull();
  });

  it('searches the title and the description, every word', () => {
    const apps = [
      card(),
      card({ id: 'b', title: 'Door schedule', description: null }),
      card({ id: 'c', title: 'Handover', description: 'Keys and manuals' }),
    ];
    expect(filterClientApps(apps, '').map((a) => a.id)).toEqual([ID, 'b', 'c']);
    expect(filterClientApps(apps, '  door ').map((a) => a.id)).toEqual(['b']);
    expect(filterClientApps(apps, 'KEYS manuals').map((a) => a.id)).toEqual(['c']);
    expect(filterClientApps(apps, 'site snag').map((a) => a.id)).toEqual([ID]);
    expect(filterClientApps(apps, 'nothing')).toEqual([]);
  });

  it('says why the launcher is empty', () => {
    expect(clientAppsEmpty('')).toBe('No apps have been shared with you yet.');
    expect(clientAppsEmpty(' x ')).toBe('No app matches that.');
  });
});

describe('an app’s problem, in a client’s words', () => {
  it('sends an ended session to sign in', () => {
    expect(clientAppProblem('app frame ticket failed (401)')).toEqual({ signIn: true });
  });

  it('never names a staff role or a builder’s tool', () => {
    for (const m of [
      'This app tried to use the tool “x”',
      'boom',
      'the app never signalled ready',
    ]) {
      const p = clientAppProblem(m);
      expect('text' in p).toBe(true);
      const text = (p as { text: string }).text;
      expect(text).not.toMatch(/admin|app_tools_set|Appsmith/i);
    }
  });
});

describe('an older brain, and the portal refresh', () => {
  it('asks the apps route once after a 404', async () => {
    forgetMissingRoutes();
    let asks = 0;
    const ask = async () => {
      asks += 1;
      throw new ApiError('Not found.', 404);
    };
    await expect(askUnlessMissing(CLIENT_APPS_ROUTE, ask)).rejects.toSatisfy(isMissingRoute);
    await expect(askUnlessMissing(CLIENT_APPS_ROUTE, ask)).rejects.toSatisfy(isMissingRoute);
    expect(asks).toBe(1);
    forgetMissingRoutes();
  });

  it('asks the apps list again on the portal refresh', async () => {
    const qc = new QueryClient();
    qc.setQueryData(CLIENT_APPS_KEY, { apps: [] });
    await refreshClientPortal(qc);
    expect(qc.getQueryState(CLIENT_APPS_KEY)?.isInvalidated).toBe(true);
  });
});
