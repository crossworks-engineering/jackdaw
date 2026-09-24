'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { fmtRelative } from '../format';
import type { AgentActivityRow } from '@mantle/client-types';

type AgentsData = { agents: AgentActivityRow[] };

/** Data-free agents debug view: fetches GET /api/debug/agents. */
export function AgentsClient() {
  const agentsQuery = useQuery({
    queryKey: ['debug', 'agents'],
    queryFn: () => apiFetch<AgentsData>('/api/debug/agents'),
  });

  if (agentsQuery.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (agentsQuery.isError && !agentsQuery.data) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        Couldn&apos;t load agents.
      </p>
    );
  }

  const { agents } = agentsQuery.data;

  return (
    <>
      {/* ─── Agent activity ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Agent activity
        </h2>
        {agents.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            No agents configured. Set one up at{' '}
            <a href="/settings/agents" className="underline">
              /settings/agents
            </a>
            .
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Agent</th>
                  <th className="px-3 py-2 text-left font-semibold">Role</th>
                  <th className="px-3 py-2 text-left font-semibold">Model</th>
                  <th className="px-3 py-2 text-right font-semibold">Priority</th>
                  <th className="px-3 py-2 text-right font-semibold">Runs</th>
                  <th className="px-3 py-2 text-left font-semibold">Last used</th>
                  <th className="px-3 py-2 text-left font-semibold">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{a.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{a.slug}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 uppercase tracking-wider">
                        {a.role}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <code className="font-mono text-xs">{a.model}</code>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.priority}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.usageCount}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {a.lastUsedAt ? fmtRelative(a.lastUsedAt) : 'never'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {a.enabled ? (
                        <span className="text-success-ink">enabled</span>
                      ) : (
                        <span className="text-muted-foreground">disabled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
