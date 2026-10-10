/**
 * The pure half of Settings > API access (brain migration 0232): labels,
 * the create body, the order of the list, and the example commands shown
 * with a new key. No React, so api-access-model.test.ts can pin it.
 *
 * A key acts exactly as the login that made it (workspaces W5b2, contract
 * 25): the brain ignores a key's access and areas, so the screen no longer
 * offers them. The create body still carries both (the brain's schema asks
 * for them): read and write, every area.
 */
import type { AccessKeyCreateInput, AccessKeyView } from '@mantle/client-types';

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
  | { error: string; field: 'name' | 'riskyTools' | 'expiry' | 'password' } {
  const { isAdmin } = rules;
  const name = form.name.trim();
  if (!name) return { error: 'Name the key, for example "Backup script".', field: 'name' };
  if (name.length > 100) return { error: 'Use 100 characters or fewer.', field: 'name' };
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
      // Ignored by the brain since W5b2 (the key acts as its login); its
      // schema still asks for both.
      access: 'read_write',
      areas: null,
      expiresInDays: form.expiry === 'never' ? null : Number(form.expiry),
      ...(risky.length ? { riskyTools: [...new Set(risky)] } : {}),
      ...(rules.needsPassword ? { password: form.password } : {}),
    },
  };
}

/** What a key may do, in one line: what its login may do (contract 25).
 *  Old keys still store an access and areas; the brain ignores both. */
export const KEY_SCOPE_TEXT = 'Same rights as its login';
export function scopeLine(_key?: Pick<AccessKeyView, 'access' | 'areas'>): string {
  return KEY_SCOPE_TEXT;
}

/** Live keys first, then ended ones; newest first inside each. */
export function sortKeys(keys: readonly AccessKeyView[]): AccessKeyView[] {
  const rank = (k: AccessKeyView) => (k.status === 'active' ? 0 : 1);
  return [...keys].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/** The commands shown with a new key: put it in a variable once (so the
 *  secret is not on every command line, or in the shell history of each),
 *  a first API call, and adding the brain to Claude Code over MCP. `origin`
 *  is the brain's origin. */
export function exampleCommands(
  origin: string,
  secret: string,
): { env: string; http: string; mcp: string } {
  return {
    env: `export MANTLE_KEY='${secret}'`,
    http: `curl -s ${origin}/api/v1/whoami \\\n  -H "Authorization: Bearer $MANTLE_KEY"`,
    mcp: `claude mcp add --transport http mantle ${origin}/api/mcp \\\n  --header "Authorization: Bearer $MANTLE_KEY"`,
  };
}
