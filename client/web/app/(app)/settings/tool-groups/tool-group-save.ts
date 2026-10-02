import type { ToolGroupDTO } from '@mantle/client-types';

/**
 * Which connector owns this group, else null. A connector group (MCP or
 * OpenAPI) gets its binding and its tool list from the connector's sync, and
 * the brain refuses `integration` or `toolSlugs` in a PATCH to it (mantle
 * server/web/app/api/tool-groups/[id]/route.ts). Name, description and
 * enabled can still change here.
 */
export function connectorKind(group: Pick<ToolGroupDTO, 'integration'>): 'mcp' | 'openapi' | null {
  if (group.integration?.mcp) return 'mcp';
  if (group.integration?.openapi) return 'openapi';
  return null;
}

export type ToolGroupSaveInput = {
  slug: string;
  name: string;
  description: string;
  toolSlugs: string[];
  enabled: boolean;
  /** `integrationToPayload`'s result: null clears the binding. */
  integration: Record<string, unknown> | null;
};

/**
 * The body for POST (create) or PATCH (edit). A new group starts unbound, so
 * POST never carries `integration`. A connector group's PATCH carries neither
 * `integration` nor `toolSlugs`: the connector owns both, and sending them,
 * even unchanged, makes the brain refuse the whole save.
 */
export function toolGroupSaveBody(
  mode: 'create' | 'edit',
  input: ToolGroupSaveInput,
  connector: 'mcp' | 'openapi' | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    description: input.description.trim(),
    enabled: input.enabled,
  };
  if (mode === 'create') {
    body.slug = input.slug.trim();
    body.toolSlugs = input.toolSlugs;
    return body;
  }
  if (connector === null) {
    body.toolSlugs = input.toolSlugs;
    body.integration = input.integration;
  }
  return body;
}
