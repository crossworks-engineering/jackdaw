import { describe, expect, it } from 'vitest';
import type { ToolGroupIntegrationDTO } from '@mantle/client-types';
import { connectorKind, toolGroupSaveBody, type ToolGroupSaveInput } from './tool-group-save';

const input: ToolGroupSaveInput = {
  slug: ' weather ',
  name: ' Weather ',
  description: ' Forecasts ',
  toolSlugs: ['forecast_get'],
  enabled: true,
  integration: { service: 'weather' },
};

const mcp: ToolGroupIntegrationDTO = { service: 'site', mcp: { url: 'https://example.test/mcp' } };
const openapi: ToolGroupIntegrationDTO = {
  service: 'site',
  openapi: { specUrl: 'https://example.test/openapi.json' },
};

describe('connectorKind', () => {
  it('names the connector that owns the group', () => {
    expect(connectorKind({ integration: mcp })).toBe('mcp');
    expect(connectorKind({ integration: openapi })).toBe('openapi');
  });

  it('is null for a plain bundle or a hand-bound API integration', () => {
    expect(connectorKind({ integration: null })).toBeNull();
    expect(connectorKind({ integration: { service: 'weather' } })).toBeNull();
  });
});

describe('toolGroupSaveBody', () => {
  it('creates with a slug and tools, and no binding', () => {
    expect(toolGroupSaveBody('create', input, null)).toEqual({
      name: 'Weather',
      description: 'Forecasts',
      enabled: true,
      slug: 'weather',
      toolSlugs: ['forecast_get'],
    });
  });

  it('edits a plain group with its tools and its binding', () => {
    expect(toolGroupSaveBody('edit', input, null)).toEqual({
      name: 'Weather',
      description: 'Forecasts',
      enabled: true,
      toolSlugs: ['forecast_get'],
      integration: { service: 'weather' },
    });
    expect(toolGroupSaveBody('edit', { ...input, integration: null }, null)).toHaveProperty(
      'integration',
      null,
    );
  });

  it('never sends tools or binding for a connector group, so the brain accepts the save', () => {
    for (const kind of ['mcp', 'openapi'] as const) {
      const body = toolGroupSaveBody('edit', input, kind);
      expect(body).toEqual({ name: 'Weather', description: 'Forecasts', enabled: true });
      expect(body).not.toHaveProperty('toolSlugs');
      expect(body).not.toHaveProperty('integration');
    }
  });
});
