import { describe, expect, it } from 'vitest';
import { filterMembership } from './tool-membership';
import { toggleValue } from '../components/toggle-list';

const tool = (slug: string, name: string, description: string, kind: string) => ({
  slug,
  name,
  description,
  kind,
});

const TOOLS = [
  tool('event_create', 'Create event', 'Adds an event to the calendar', 'builtin'),
  tool('event_list', 'List events', 'Lists calendar events in a window', 'builtin'),
  tool('crm_lookup', 'CRM lookup', 'Finds a customer record', 'mcp'),
  tool('weather_now', 'Weather now', 'Current conditions for a place', 'http'),
];
const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug);

describe('filterMembership', () => {
  it('shows every tool for an empty query and All', () => {
    expect(slugs(filterMembership(TOOLS, [], '  ', 'all'))).toEqual(slugs(TOOLS));
  });

  it('matches slug, name, description and handler kind, case-insensitive', () => {
    expect(slugs(filterMembership(TOOLS, [], 'EVENT_LIST', 'all'))).toEqual(['event_list']);
    expect(slugs(filterMembership(TOOLS, [], 'weather NOW', 'all'))).toEqual(['weather_now']);
    expect(slugs(filterMembership(TOOLS, [], 'customer', 'all'))).toEqual(['crm_lookup']);
    expect(slugs(filterMembership(TOOLS, [], 'mcp', 'all'))).toEqual(['crm_lookup']);
  });

  it('needs every word to match, in any field', () => {
    expect(slugs(filterMembership(TOOLS, [], 'builtin window', 'all'))).toEqual(['event_list']);
    expect(slugs(filterMembership(TOOLS, [], 'builtin customer', 'all'))).toEqual([]);
  });

  it('In this group and Not in this group split on the selection', () => {
    const sel = ['event_create', 'crm_lookup'];
    expect(slugs(filterMembership(TOOLS, sel, '', 'in'))).toEqual(['event_create', 'crm_lookup']);
    expect(slugs(filterMembership(TOOLS, sel, '', 'out'))).toEqual(['event_list', 'weather_now']);
    expect(slugs(filterMembership(TOOLS, sel, 'event', 'out'))).toEqual(['event_list']);
  });
});

describe('the selection rule: the filter hides rows, it never drops them', () => {
  it('ticking a shown tool keeps the ticked tools the filter hides', () => {
    const selected = ['event_create', 'crm_lookup'];
    // Filtered to "weather": both ticked tools are hidden.
    const shown = filterMembership(TOOLS, selected, 'weather', 'all');
    expect(slugs(shown)).toEqual(['weather_now']);
    const next = toggleValue(selected, 'weather_now');
    expect(next.sort()).toEqual(['crm_lookup', 'event_create', 'weather_now']);
  });

  it('unticking a shown tool removes only that tool', () => {
    const selected = ['event_create', 'crm_lookup', 'weather_now'];
    expect(toggleValue(selected, 'weather_now').sort()).toEqual(['crm_lookup', 'event_create']);
  });

  it('keeps a selected slug the brain no longer lists', () => {
    expect(toggleValue(['gone_tool'], 'event_list').sort()).toEqual(['event_list', 'gone_tool']);
  });
});
