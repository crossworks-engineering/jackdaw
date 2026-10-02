import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MembershipScope } from '@/lib/tool-membership';
import { ToggleList, toggleValue } from './toggle-list';
import { ToolPickerView, type ToolOption } from './tool-picker';

/**
 * The tool group editor's membership list: the filter box, the scope chips,
 * the count and the empty state, and the rule that the filter only hides rows.
 */
const opt = (slug: string, name: string, description: string, kind: string): ToolOption => ({
  slug,
  name,
  description,
  kind,
  requiresConfirm: false,
});

const TOOLS = [
  opt('event_create', 'Create event', 'Adds an event to the calendar', 'builtin'),
  opt('event_list', 'List events', 'Lists calendar events in a window', 'builtin'),
  opt('crm_lookup', 'CRM lookup', 'Finds a customer record', 'mcp'),
  opt('weather_now', 'Weather now', 'Current conditions for a place', 'http'),
  opt('shell_run', 'Run shell', 'Runs a command in the sandbox', 'shell'),
];

type ViewProps = Parameters<typeof ToolPickerView>[0];
const props = (extra: Partial<ViewProps> = {}): ViewProps => ({
  available: TOOLS,
  selected: [],
  onChange: () => {},
  query: '',
  onQuery: () => {},
  scope: 'all' as MembershipScope,
  onScope: () => {},
  ...extra,
});
const render = (extra: Partial<ViewProps> = {}) =>
  renderToStaticMarkup(createElement(ToolPickerView, props(extra)));
const rowNames = (html: string) =>
  [...html.matchAll(/aria-label="Toggle ([^"]+)"/g)].map((m) => m[1]);

/** The ToggleList element the view hands its rows to (the view uses no hooks). */
function findToggleList(node: ReactNode): ReactElement<Parameters<typeof ToggleList>[0]> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findToggleList(n);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === ToggleList) return node as ReactElement<Parameters<typeof ToggleList>[0]>;
  return findToggleList((node.props as { children?: ReactNode }).children);
}

describe('ToolPickerView filter', () => {
  it('names the filter box for a screen reader', () => {
    expect(render()).toContain('aria-label="Filter tools in this group"');
  });

  it('shows every tool and the total when nothing filters', () => {
    const html = render();
    expect(rowNames(html)).toEqual([
      'Create event',
      'List events',
      'CRM lookup',
      'Weather now',
      'Run shell',
    ]);
    expect(html).toContain('>5 tools<');
  });

  it('filters as typed, case-insensitive, every word must match, and says N of M', () => {
    const html = render({ query: 'CALENDAR window' });
    expect(rowNames(html)).toEqual(['List events']);
    expect(html).toContain('>1 of 5 tools<');
  });

  it('matches the handler kind', () => {
    expect(rowNames(render({ query: 'shell' }))).toEqual(['Run shell']);
    expect(rowNames(render({ query: 'mcp' }))).toEqual(['CRM lookup']);
  });

  it('says No tools match and offers Clear', () => {
    const html = render({ query: 'nothing like this' });
    expect(rowNames(html)).toEqual([]);
    expect(html).toContain('No tools match');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Clear<\/button>/);
    expect(html).toContain('>0 of 5 tools<');
  });

  it('In this group and Not in this group split the rows, with counts', () => {
    const selected = ['event_create', 'crm_lookup'];
    const inside = render({ selected, scope: 'in' });
    expect(rowNames(inside)).toEqual(['Create event', 'CRM lookup']);
    expect(inside).toContain('>2 of 5 tools<');
    expect(inside).toMatch(/aria-pressed="true"[^>]*>In this group/);
    const outside = render({ selected, scope: 'out' });
    expect(rowNames(outside)).toEqual(['List events', 'Weather now', 'Run shell']);
    expect(outside).toMatch(/In this group<span[^>]*>2<\/span>/);
    expect(outside).toMatch(/Not in this group<span[^>]*>3<\/span>/);
  });
});

describe('ToolPickerView selection rule', () => {
  const selected = ['event_create', 'crm_lookup'];

  it('hands ToggleList the whole selection while filtered', () => {
    const list = findToggleList(ToolPickerView(props({ selected, query: 'weather' })));
    expect(list).not.toBeNull();
    expect(list!.props.items.map((i) => i.value)).toEqual(['weather_now']);
    expect(list!.props.selected).toEqual(selected);
  });

  it('a switch flipped while filtered keeps the hidden ticked tools', () => {
    let saved: string[] = [];
    const list = findToggleList(
      ToolPickerView(props({ selected, query: 'weather', onChange: (n) => (saved = n) })),
    )!;
    // Exactly what ToggleList does when the Weather now switch is clicked.
    list.props.onChange(toggleValue(list.props.selected, 'weather_now'));
    expect([...saved].sort()).toEqual(['crm_lookup', 'event_create', 'weather_now']);
  });

  it('shows hidden ticked rows as ticked again once the filter clears', () => {
    const html = render({ selected: ['event_create', 'weather_now'] });
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Toggle Create event"/);
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Toggle Weather now"/);
    expect(html).toMatch(/aria-checked="false"[^>]*aria-label="Toggle List events"/);
  });
});

describe('ToolPickerView read-only', () => {
  const selected = ['crm_lookup', 'event_list', 'gone_tool'];

  it('lists only the group tools, no switches and no scope chips', () => {
    const html = render({ readOnly: true, selected });
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('In this group');
    expect(html).toContain('>crm_lookup<');
    expect(html).toContain('>event_list<');
    // A slug the brain no longer lists still shows, as a bare slug.
    expect(html).toContain('>gone_tool<');
    expect(html).not.toContain('>weather_now<');
    expect(html).toContain('>3 tools<');
  });

  it('filters the read-only list with the same box', () => {
    const html = render({ readOnly: true, selected, query: 'customer' });
    expect(html).toContain('aria-label="Filter tools in this group"');
    expect(html).toContain('>crm_lookup<');
    expect(html).not.toContain('>event_list<');
    expect(html).toContain('>1 of 3 tools<');
  });

  it('ignores a leftover scope on the read-only list', () => {
    expect(render({ readOnly: true, selected, scope: 'out' })).toContain('>3 tools<');
  });

  it('says so when the group has no tools', () => {
    expect(render({ readOnly: true, selected: [] })).toContain('No tools in this group.');
  });
});
