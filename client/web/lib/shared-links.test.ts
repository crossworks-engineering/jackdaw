import { describe, expect, it } from 'vitest';
import type { AccessLevel } from '@mantle/client-types';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import type { RetiredClientLinkRow } from '@mantle/client-types';
import {
  CLIENTS_HREF,
  OLD_ADMIN_LINK,
  canCopyLink,
  linkLevelLabel,
  retiredItemHref,
  retiredLevelLine,
  retiredLinksOf,
  retiredOnLine,
  retiredViewsLine,
} from './shared-links';

/**
 * Shared links (audit A18): no level lookup since W5b2; an old client link is never
 * offered for copy; a live link on an admin item is an old open link. Since
 * client logins C3 the tab also lists the old client links the brain
 * retired (`retired`), which a brain before C3 does not send.
 */
describe('links on a W5b2 brain (no level on the rows)', () => {
  it('offers Copy for a row that carries no level', () => {
    expect(canCopyLink(undefined)).toBe(true);
  });
});

describe('Copy', () => {
  it('is not offered for an old client link', () => {
    expect(canCopyLink('client')).toBe(false);
  });

  it('is offered for every other link, and where the level is unknown', () => {
    for (const l of ['public', 'team', 'admin', undefined] as const) {
      expect(canCopyLink(l as AccessLevel | undefined), String(l)).toBe(true);
    }
  });
});

describe('the level badge', () => {
  it('names a live link on an admin item (a task, an event) an old open link', () => {
    expect(linkLevelLabel('admin')).toBe('Admin (old open link)');
    expect(OLD_ADMIN_LINK).toBe('Admin (old open link)');
  });

  it('is the level itself otherwise', () => {
    expect(linkLevelLabel('public')).toBe('Public');
    expect(linkLevelLabel('client')).toBe('Client');
  });
});

describe('a brain after C3, with no old client link live', () => {
  it('offers Copy for every live link and asks for no levels again', () => {
    const rows = [{ level: 'public' as const }, { level: 'public' as const }];
    for (const r of rows) expect(canCopyLink(r.level)).toBe(true);
  });
});

describe('retired client links', () => {
  const row: RetiredClientLinkRow = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    nodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    nodeType: 'note',
    title: 'Meeting notes',
    icon: null,
    level: 'client',
    createdAt: '2026-03-01T10:00:00.000Z',
    retiredAt: '2026-09-29T08:00:00.000Z',
    viewCount: 1,
    lastViewedAt: null,
  };

  it('come from the answer when it has them', () => {
    expect(retiredLinksOf({ retired: [row] })).toEqual([row]);
    expect(retiredLinksOf({ retired: [] })).toEqual([]);
  });

  it('are none when a brain before C3 sends no list', () => {
    expect(retiredLinksOf({})).toEqual([]);
    expect(retiredLinksOf({ retired: null })).toEqual([]);
  });

  it('link to the item, and send the admin to Team admin > Clients', () => {
    expect(retiredItemHref(row)).toBe('/n/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(CLIENTS_HREF).toBe('/settings/users?selected=what-clients-see');
  });

  it('say when they retired, and just "retired" when the brain has no date', () => {
    expect(retiredOnLine(row)).toBe(`retired ${formatDate(row.retiredAt)}`);
    expect(retiredOnLine({ retiredAt: null })).toBe('retired');
  });

  it('say how much they were used, and when last', () => {
    expect(retiredViewsLine(row)).toBe('1 view');
    expect(retiredViewsLine({ viewCount: 0, lastViewedAt: null })).toBe('0 views');
    expect(retiredViewsLine({ viewCount: 5, lastViewedAt: '2026-09-20T09:00:00.000Z' })).toBe(
      `5 views, last ${formatDate('2026-09-20T09:00:00.000Z')}`,
    );
  });

  it("say the item's level now", () => {
    expect(retiredLevelLine(row)).toBe('Note now at Client');
    expect(retiredLevelLine({ nodeType: 'page', level: 'team' })).toBe('Page now at Team');
  });
});
