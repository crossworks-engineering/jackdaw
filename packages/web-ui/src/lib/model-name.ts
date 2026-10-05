/**
 * A model id as people read it: `anthropic/claude-sonnet-5-5` reads
 * "Sonnet 5.5", `x-ai/grok-latest` reads "grok-latest". The full id stays the
 * source of truth (show it on hover); this is only the label.
 *
 * Steps: drop every provider prefix (`openrouter/anthropic/...`), the
 * OpenRouter alias mark `~`, a variant suffix (`:free`, `:nitro`), and a
 * date suffix (`-20251001`, `-2025-04-14`). Claude ids then become
 * "<Family> <version>"; every other id keeps its own spelling.
 */
const CLAUDE_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;

function family(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** `5-5` or `5.5` reads "5.5"; `latest` stays. */
function version(v: string): string {
  return v.replace(/-/g, '.');
}

export function shortModelName(model: string | null | undefined): string {
  let s = (model ?? '').trim();
  if (!s) return '';
  s = s.split('/').filter(Boolean).pop() ?? s;
  s = s.replace(/^~+/, '');
  s = s.replace(/:[a-z0-9._-]+$/i, '');
  s = s.replace(/[-@](\d{8}|\d{4}-\d{2}-\d{2})$/, '');

  const fam = CLAUDE_FAMILIES.join('|');
  // Current naming: claude-sonnet-5-5, claude-opus-4.1, claude-sonnet-latest.
  const current = s.match(
    new RegExp(`^claude-(${fam})-(\\d+(?:[.-]\\d+)?|latest)(?:-(.+))?$`, 'i'),
  );
  if (current) {
    const [, f, v, rest] = current;
    return [family(f!), version(v!), rest].filter(Boolean).join(' ');
  }
  // Older naming: claude-3-5-sonnet, claude-3-opus.
  const older = s.match(new RegExp(`^claude-(\\d+(?:[.-]\\d+)?)-(${fam})(?:-(.+))?$`, 'i'));
  if (older) {
    const [, v, f, rest] = older;
    return [family(f!), version(v!), rest].filter(Boolean).join(' ');
  }
  // A bare family alias: claude-sonnet.
  const bare = s.match(new RegExp(`^claude-(${fam})$`, 'i'));
  if (bare) return family(bare[1]!);
  return s;
}
