import { describe, expect, it } from 'vitest';
import type { ToolHandler } from '@mantle/client-types';
import { filterToolGroups, filterTools, matchesQuery } from './tool-search';

const tool = (slug: string, name: string, description: string, handler: ToolHandler) => ({
  slug,
  name,
  description,
  handler,
});

const TOOLS = [
  tool('web_search', 'Web search', 'Search the public web.', {
    kind: 'builtin',
    ref: 'web_search',
  }),
  tool('weather_now', 'Weather now', 'Current weather for a place.', {
    kind: 'http',
    url: 'https://api.example.com/weather/{place}',
    method: 'GET',
  }),
  tool('disk_free', 'Disk free', 'Free space on the brain.', { kind: 'shell', cmd: 'df -h' }),
  tool('crm_find_lead', 'Find lead', 'Look a lead up by email.', {
    kind: 'mcp',
    group: 'sales-crm',
    toolName: 'find_lead',
  }),
  tool('morning_brief', 'Morning brief', 'Weather plus calendar.', {
    kind: 'recipe',
    steps: [{ tool: 'weather_now' }],
  }),
];

const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug);

describe('matchesQuery', () => {
  it('matches everything on an empty or blank query', () => {
    expect(matchesQuery(['a'], '')).toBe(true);
    expect(matchesQuery(['a'], '   ')).toBe(true);
  });

  it('is case-insensitive and needs every word', () => {
    expect(matchesQuery(['Find Lead', 'mcp'], 'LEAD mcp')).toBe(true);
    expect(matchesQuery(['Find Lead', 'mcp'], 'lead http')).toBe(false);
  });

  it('skips missing fields', () => {
    expect(matchesQuery([null, undefined, 'slug'], 'slug')).toBe(true);
  });
});

describe('filterTools', () => {
  it('returns every tool for an empty query', () => {
    expect(slugs(filterTools(TOOLS, ''))).toEqual(slugs(TOOLS));
  });

  it('matches the slug, the display name and the description', () => {
    expect(slugs(filterTools(TOOLS, 'disk_'))).toEqual(['disk_free']);
    expect(slugs(filterTools(TOOLS, 'web SEARCH'))).toEqual(['web_search']);
    expect(slugs(filterTools(TOOLS, 'by email'))).toEqual(['crm_find_lead']);
  });

  it('matches the handler kind', () => {
    expect(slugs(filterTools(TOOLS, 'builtin'))).toEqual(['web_search']);
    expect(slugs(filterTools(TOOLS, 'http'))).toEqual(['weather_now']);
    expect(slugs(filterTools(TOOLS, 'shell'))).toEqual(['disk_free']);
    expect(slugs(filterTools(TOOLS, 'recipe'))).toEqual(['morning_brief']);
    expect(slugs(filterTools(TOOLS, 'mcp'))).toEqual(['crm_find_lead']);
  });

  it('matches a connector tool by its group slug and by the group name', () => {
    expect(slugs(filterTools(TOOLS, 'sales-crm'))).toEqual(['crm_find_lead']);
    expect(slugs(filterTools(TOOLS, 'pipeline'))).toEqual([]);
    const names = new Map([['sales-crm', 'Sales pipeline']]);
    expect(slugs(filterTools(TOOLS, 'pipeline', names))).toEqual(['crm_find_lead']);
  });

  it('does not match a group name on a tool that is not a connector tool', () => {
    const names = new Map([['web_search', 'Searchers']]);
    expect(slugs(filterTools(TOOLS, 'searchers', names))).toEqual([]);
  });

  it('keeps the input order', () => {
    expect(slugs(filterTools(TOOLS, 'weather'))).toEqual(['weather_now', 'morning_brief']);
  });
});

describe('filterToolGroups', () => {
  const GROUPS = [
    { slug: 'web', name: 'Web', description: 'Search and fetch.', integration: null },
    {
      slug: 'sales-crm',
      name: 'Sales pipeline',
      description: 'Connector tools.',
      integration: { service: 'crm' },
    },
  ];

  it('matches the slug, name, description and integration service', () => {
    expect(slugs(filterToolGroups(GROUPS, ''))).toEqual(['web', 'sales-crm']);
    expect(slugs(filterToolGroups(GROUPS, 'SALES-'))).toEqual(['sales-crm']);
    expect(slugs(filterToolGroups(GROUPS, 'pipeline'))).toEqual(['sales-crm']);
    expect(slugs(filterToolGroups(GROUPS, 'fetch'))).toEqual(['web']);
    expect(slugs(filterToolGroups(GROUPS, 'crm connector'))).toEqual(['sales-crm']);
    expect(slugs(filterToolGroups(GROUPS, 'nothing'))).toEqual([]);
  });
});
