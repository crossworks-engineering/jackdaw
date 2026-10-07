/**
 * The pure half of Settings > API access (brain migration 0232): labels,
 * the create body, the order of the list, and the example commands shown
 * with a new key. No React, so api-access-model.test.ts can pin it.
 */
import type {
  AccessKeyAccess,
  AccessKeyArea,
  AccessKeyCreateInput,
  AccessKeyView,
} from '@mantle/client-types';

export const AREA_LABEL: Record<AccessKeyArea, string> = {
  // Search reads every kind of item, email and journal included.
  search: 'Search (every kind)',
  pages: 'Pages',
  notes: 'Notes',
  tasks: 'Tasks',
  tables: 'Tables',
  files: 'Files',
  calendar: 'Calendar',
  contacts: 'Contacts',
  journal: 'Journal',
  apps: 'Apps',
};

export const ACCESS_LABEL: Record<AccessKeyAccess, string> = {
  read: 'Read only',
  read_write: 'Read and write',
};

/** The expiry choices, in days; `never` is no expiry. */
export const EXPIRY_CHOICES = ['30', '90', '365', 'never'] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

export const EXPIRY_LABEL: Record<ExpiryChoice, string> = {
  '30': '30 days',
  '90': '90 days',
  '365': '1 year',
  never: 'Never',
};

/** The expiry choices a login may pick: up to its maximum (a member's 90
 *  days, a client's 30), and "never" only without one (an admin). */
export function expiryChoicesFor(maxDays: number | null): ExpiryChoice[] {
  return EXPIRY_CHOICES.filter((c) =>
    c === 'never' ? maxDays === null : maxDays === null || Number(c) <= maxDays,
  );
}

/** The expiry a new key starts on: the brain's default when it is one of
 *  the choices this login may pick, else the longest it may pick. */
export function defaultExpiryChoice(
  defaultDays: number,
  maxDays: number | null = null,
): ExpiryChoice {
  const choices = expiryChoicesFor(maxDays);
  const v = String(defaultDays);
  if ((choices as string[]).includes(v)) return v as ExpiryChoice;
  const numeric = choices.filter((c) => c !== 'never');
  return numeric[numeric.length - 1] ?? '30';
}

export type CreateForm = {
  name: string;
  access: AccessKeyAccess;
  allAreas: boolean;
  areas: AccessKeyArea[];
  expiry: ExpiryChoice;
  /** Comma or space separated tool slugs (an admin's own key only). */
  riskyTools: string;
  /** The caller's password (an admin or member re-types it). */
  password: string;
};

/** What the brain says about the caller (GET /api/access-keys). */
export type CreateRules = {
  isAdmin: boolean;
  needsPassword: boolean;
  maxExpiryDays: number | null;
};

/** The POST body for a form, or the problem to show. */
export function createBody(
  form: CreateForm,
  rules: CreateRules,
):
  | { body: AccessKeyCreateInput }
  | { error: string; field: 'name' | 'areas' | 'riskyTools' | 'expiry' | 'password' } {
  const { isAdmin } = rules;
  const name = form.name.trim();
  if (!name) return { error: 'Name the key, for example "Backup script".', field: 'name' };
  if (name.length > 100) return { error: 'Use 100 characters or fewer.', field: 'name' };
  if (!form.allAreas && form.areas.length === 0) {
    return { error: 'Pick at least one area, or allow all areas.', field: 'areas' };
  }
  const risky = isAdmin
    ? form.riskyTools
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (risky.some((s) => !/^[a-z0-9_]{1,64}$/.test(s))) {
    return { error: 'Tool names use a to z, 0 to 9 and _ only.', field: 'riskyTools' };
  }
  if (!(expiryChoicesFor(rules.maxExpiryDays) as string[]).includes(form.expiry)) {
    return { error: `Your keys can last at most ${rules.maxExpiryDays} days.`, field: 'expiry' };
  }
  if (rules.needsPassword && !form.password) {
    return { error: 'Type your password to make a key.', field: 'password' };
  }
  return {
    body: {
      name,
      access: form.access,
      areas: form.allAreas ? null : [...new Set(form.areas)],
      expiresInDays: form.expiry === 'never' ? null : Number(form.expiry),
      ...(risky.length ? { riskyTools: [...new Set(risky)] } : {}),
      ...(rules.needsPassword ? { password: form.password } : {}),
    },
  };
}

/** What a key may do, in one line. */
export function scopeLine(key: Pick<AccessKeyView, 'access' | 'areas'>): string {
  const areas = key.areas ? key.areas.map((a) => AREA_LABEL[a]).join(', ') : 'All areas';
  return `${ACCESS_LABEL[key.access]} · ${areas}`;
}

/** Live keys first, then ended ones; newest first inside each. */
export function sortKeys(keys: readonly AccessKeyView[]): AccessKeyView[] {
  const rank = (k: AccessKeyView) => (k.status === 'active' ? 0 : 1);
  return [...keys].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/** The two commands shown with a new key: a first API call, and adding the
 *  brain to Claude Code over MCP. `origin` is the brain's origin. */
export function exampleCommands(origin: string, secret: string): { http: string; mcp: string } {
  return {
    http: `curl -s ${origin}/api/v1/whoami \\\n  -H "Authorization: Bearer ${secret}"`,
    mcp: `claude mcp add --transport http mantle ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${secret}"`,
  };
}
