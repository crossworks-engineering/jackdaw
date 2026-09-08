'use client';

/**
 * The agents screen's pickers: skills, tool groups, delegates, and the context-window hint.
 *
 * Moved out of agents-client.tsx unchanged (structure pass, phase 1):
 * already standalone, just living in the wrong file. No signatures changed.
 */
import { ToggleList, type ToggleListItem } from '@/components/toggle-list';
import type { SkillOption, ToolGroupOption } from './agent-form-state';

/**
 * Multi-select chip picker for tools. Each chip carries the slug; click
 * to toggle. Tools marked `requiresConfirm` get a small badge so the
 * operator can see at a glance which ones will (eventually) pause for
 * approval. Hovering shows the description.
 */
/**
 * Skill multi-select — one row per skill (name + description + Switch), with a
 * count of the tools each skill folds into the agent's allowlist.
 */
export function SkillPicker({
  available,
  selected,
  onChange,
}: {
  available: SkillOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const items: ToggleListItem[] = available.map((s) => ({
    value: s.slug,
    label: s.name,
    description: s.description,
  }));
  return (
    <ToggleList items={items} selected={selected} onChange={onChange} collapsible searchable />
  );
}

/**
 * Tool-group multi-select — the PRIMARY capability control. One row per group
 * (name + description + member-tool count). Granting a group joins all its tools
 * into the agent's effective set at runtime.
 */
export function ToolGroupPicker({
  available,
  selected,
  onChange,
}: {
  available: ToolGroupOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const items: ToggleListItem[] = available.map((g) => ({
    value: g.slug,
    label: g.name,
    description: g.description,
    meta: (
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {g.toolSlugs.length} tool{g.toolSlugs.length === 1 ? '' : 's'}
      </span>
    ),
  }));
  return (
    <ToggleList items={items} selected={selected} onChange={onChange} collapsible searchable />
  );
}

/**
 * Delegation multi-select. Chips are the OTHER agents' slugs; selecting one
 * adds it to this agent's memory_config.delegate_to allowlist, so it can be
 * reached via the invoke_agent tool. Disabled agents stay selectable but are
 * marked — invoke_agent only resolves enabled targets, so they won't work
 * until re-enabled.
 */
export function DelegatePicker({
  available,
  selected,
  onChange,
}: {
  available: { slug: string; name: string; enabled: boolean }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const items: ToggleListItem[] = available.map((a) => ({
    value: a.slug,
    label: a.name,
    description: a.enabled ? undefined : 'Disabled — won’t resolve until re-enabled',
    meta: (
      <>
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
          {a.slug}
        </code>
        {!a.enabled && (
          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            off
          </span>
        )}
      </>
    ),
  }));
  return (
    <ToggleList items={items} selected={selected} onChange={onChange} collapsible searchable />
  );
}

/**
 * Readout under the Model field showing the resolved context window for the
 * typed slug, from the live OpenRouter map (static fallback) fetched by the
 * form. Renders nothing until a model is entered; says so plainly when a
 * slug isn't in the catalog (usually a typo in the id).
 */
export function ContextWindowHint({
  model,
  limits,
}: {
  model: string;
  limits: Record<string, number>;
}) {
  const slug = model.trim().toLowerCase();
  if (!slug) return null;
  const limit = limits[slug];
  if (!limit) {
    return (
      <p className="text-xs text-muted-foreground">
        Context window: <span className="text-warning-ink">unknown for this slug</span> — check the
        exact id at openrouter.ai/models.
      </p>
    );
  }
  const pretty =
    limit >= 1_000_000
      ? `${(limit / 1_000_000).toFixed(limit % 1_000_000 === 0 ? 0 : 1)}M`
      : limit >= 1_000
        ? `${Math.round(limit / 1_000)}k`
        : `${limit}`;
  return (
    <p className="text-xs text-muted-foreground">
      Context window: <span className="font-medium text-foreground tabular-nums">{pretty}</span>{' '}
      tokens ({limit.toLocaleString()})
    </p>
  );
}
