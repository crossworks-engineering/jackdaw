import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MEMBER_ITEM_KINDS } from '../../lib/member-kinds';
import { OWNER_THREAD_KINDS } from '../../lib/owner-client-thread';

/**
 * Every kind a client reads under "Shared with you" (MEMBER_ITEM_KINDS, the
 * type of a ClientSharedRow) carries the client thread, so every one needs an
 * owner screen that mounts it (client tier audit U1: drawings had none, and a
 * client's comment on a drawing reached no admin). The node test runner cannot
 * render the screens, so this reads them.
 */
const APP_DIR = fileURLToPath(new URL('../../app/(app)', import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** The kinds some owner screen mounts the thread for. */
function mountedKinds(): Set<string> {
  const kinds = new Set<string>();
  for (const file of sources(APP_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<OwnerClientThread\b[^>]*\btype="(\w+)"/g)) kinds.add(m[1]!);
  }
  return kinds;
}

describe('the owner client thread covers every kind a client can comment on', () => {
  it('the owner kinds are the shared kinds', () => {
    expect([...OWNER_THREAD_KINDS].sort()).toEqual([...MEMBER_ITEM_KINDS].sort());
  });

  it.each([...MEMBER_ITEM_KINDS])('an owner screen mounts the thread for %s', (kind) => {
    expect(mountedKinds().has(kind)).toBe(true);
  });
});
