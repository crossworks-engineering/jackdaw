'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NavGroup } from '@mantle/web-ui/layout/nav-items';

/**
 * How much of the menu to show at once.
 *
 * Fifty-one destinations in four groups is a complete map and a poor daily
 * list. The folding heads already helped; this is the other half — say which
 * JOB you are here to do and the map narrows to it.
 *
 *  - `work`     the daily surfaces: Workspace and Review, whole.
 *  - `settings` what you configure to make the brain do its job — the agents,
 *               the tools they can reach, the accounts they read, and who you
 *               are. Not the machine's plumbing.
 *  - `admin`    everything, exactly as before this existed.
 *
 * Three SLICES, not three nesting levels: `settings` does not also show
 * Workspace, or it would be `admin` with extra steps. Anything reached often
 * enough for that to chafe wants a star instead — Favorites renders in every
 * scope, which is what stops the narrowing from ever being a trap.
 */
export type NavScope = 'work' | 'settings' | 'admin';

export const NAV_SCOPES: Array<{ id: NavScope; label: string }> = [
  { id: 'work', label: 'Work' },
  { id: 'settings', label: 'Settings' },
  { id: 'admin', label: 'Admin' },
];

const KEY = 'mantle_nav_scope_v1';

/** Groups shown whole under `work` — matched by LABEL, which is what the
 *  shared nav list gives us to key on. */
const WORK_GROUPS = new Set(['Workspace', 'Review']);

/**
 * What `settings` shows, by href.
 *
 * The line drawn is **capability versus plumbing**: things you change to make
 * the brain do a new job, against things you touch when operating the box it
 * runs on. Agents, the tools and skills they can reach, the accounts and keys
 * they authenticate with, how text is embedded, when heartbeats fire, and who
 * you are — those are capability. Backups, updates, audit, logins, peers, the
 * local network, entity merges and stored PDF passwords are plumbing, and they
 * live in `admin` with the System group.
 *
 * ⚠ Jason named agents, AI workers, MCP and profile and said he was probably
 * missing obvious ones; the rest of this list is a PROPOSAL. It is a flat set
 * of hrefs for exactly that reason — moving one line between here and admin is
 * the whole edit.
 */
const SETTINGS_HREFS = new Set([
  // Who you are, and what it looks like.
  '/settings/profile',
  '/settings/appearance',
  // The things that act on your behalf.
  '/settings/agents',
  '/settings/ai-workers',
  '/settings/worker-groups',
  '/settings/heartbeats',
  // What they can reach.
  '/settings/mcp',
  '/settings/tools',
  '/settings/tool-groups',
  '/settings/skills',
  '/models',
  // What they read, and what they authenticate with.
  '/settings/accounts',
  '/settings/keys',
  '/settings/microsoft',
  '/settings/calendar',
  '/settings/embedding',
]);

/**
 * The groups a scope shows.
 *
 * Empty groups are dropped rather than rendered as a bare heading, so a scope
 * never shows a label with nothing under it.
 */
export function scopeGroups<G extends NavGroup>(groups: G[], scope: NavScope): G[] {
  if (scope === 'admin') return groups;
  return groups
    .map((group) => {
      if (scope === 'work') {
        return WORK_GROUPS.has(group.label) ? group : { ...group, items: [] };
      }
      return { ...group, items: group.items.filter((i) => SETTINGS_HREFS.has(i.href)) };
    })
    .filter((group) => group.items.length > 0);
}

function isScope(v: unknown): v is NavScope {
  return v === 'work' || v === 'settings' || v === 'admin';
}

/**
 * The chosen scope, remembered per browser.
 *
 * ⚠ Starts at `admin` on the server and on first paint, and adopts the stored
 * choice on mount. That order is deliberate in both directions: the server has
 * no localStorage, so seeding from it would be a hydration mismatch — and of
 * the three, `admin` is the only safe thing to render before we know, because
 * it shows everything. Starting at `work` would blink most of the menu out of
 * existence on every single load for anyone who had chosen otherwise.
 *
 * The DEFAULT for someone who has never chosen is `work`, applied on mount. It
 * is the scope the feature exists for, and the control sits directly above the
 * list, labelled, so a narrowed menu explains itself.
 */
export function useNavScope(): { scope: NavScope; setScope: (s: NavScope) => void } {
  const [scope, setScopeState] = useState<NavScope>('admin');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      setScopeState(isScope(raw) ? raw : 'work');
    } catch {
      setScopeState('work');
    }
  }, []);

  const setScope = useCallback((next: NavScope) => {
    setScopeState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* quota / private mode — the choice just won't persist */
    }
  }, []);

  return { scope, setScope };
}
