import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createVault, isSessionId, type VaultCodec } from './vault';

/**
 * The shell's token vault. Three things are worth holding:
 *
 *   - the update signs nobody out: the one-slot file an earlier build wrote
 *     becomes a login's own file, and the bearer is readable throughout;
 *   - a session id comes from the PAGE and ends up in a path, so nothing that
 *     could climb out of the brain's own directory is accepted;
 *   - one brain's logins are not another's, and a removed brain leaves nothing.
 *
 * Runs against a real temp directory with a stand-in codec: the keychain is
 * Electron's, the file handling is ours.
 */

/** Reversible and visibly not plaintext, so a test can tell the two apart. */
const codec: VaultCodec = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (buf) => buf.toString('utf8').replace(/^enc:/, ''),
};

const BRAIN_A = '11111111-1111-4111-8111-111111111111';
const BRAIN_B = '22222222-2222-4222-8222-222222222222';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jackdaw-vault-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('one bearer per login', () => {
  it('round-trips, encrypted at rest, in a file only its owner can read', () => {
    const vault = createVault(dir, codec);
    vault.writeFor(BRAIN_A, 'session-1', 'bearer.one');

    expect(vault.readFor(BRAIN_A, 'session-1')).toBe('bearer.one');
    const file = join(dir, 'vault', BRAIN_A, 'session-1.tok');
    expect(readFileSync(file, 'utf8')).not.toContain('bearer.one');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('keeps the logins of one brain apart, and the brains apart from each other', () => {
    const vault = createVault(dir, codec);
    vault.writeFor(BRAIN_A, 's1', 'a.one');
    vault.writeFor(BRAIN_A, 's2', 'a.two');
    vault.writeFor(BRAIN_B, 's1', 'b.one');

    expect(vault.readFor(BRAIN_A, 's1')).toBe('a.one');
    expect(vault.readFor(BRAIN_A, 's2')).toBe('a.two');
    expect(vault.readFor(BRAIN_B, 's1')).toBe('b.one');

    vault.clearFor(BRAIN_A, 's1');
    expect(vault.readFor(BRAIN_A, 's1')).toBeNull();
    expect(vault.readFor(BRAIN_A, 's2')).toBe('a.two');
    expect(vault.readFor(BRAIN_B, 's1')).toBe('b.one');
  });

  it('falls back to a plain 0600 file where there is no keychain', () => {
    const vault = createVault(dir, { ...codec, isEncryptionAvailable: () => false });
    vault.writeFor(BRAIN_A, 's1', 'bearer.one');
    expect(vault.readFor(BRAIN_A, 's1')).toBe('bearer.one');
  });

  it('answers null for a file it cannot read, rather than throwing into the IPC handler', () => {
    const vault = createVault(dir, {
      ...codec,
      decryptString: () => {
        throw new Error('keychain locked');
      },
    });
    vault.writeFor(BRAIN_A, 's1', 'bearer.one');
    expect(vault.readFor(BRAIN_A, 's1')).toBeNull();
  });
});

describe('a session id is the page’s, so it is not trusted', () => {
  const hostile = [
    '../other-brain/s1',
    '..',
    '.',
    'a/b',
    'a\\b',
    'with.dot',
    '',
    'x'.repeat(81),
    'nul\0byte',
    42,
    null,
    undefined,
    { toString: () => 's1' },
  ];

  it('accepts what the registry mints and nothing a path could be built from', () => {
    expect(isSessionId('3f0e8a52-6f0b-4b5e-9d5e-2f0f6f1f7a10')).toBe(true);
    expect(isSessionId('sl9x2k4abcd')).toBe(true);
    for (const id of hostile) expect(isSessionId(id)).toBe(false);
  });

  it('writes nothing, reads nothing and deletes nothing for such an id', () => {
    const vault = createVault(dir, codec);
    vault.writeFor(BRAIN_B, 's1', 'b.one');

    for (const id of hostile) {
      vault.writeFor(BRAIN_A, id, 'x');
      expect(vault.readFor(BRAIN_A, id)).toBeNull();
      expect(vault.adopt(BRAIN_A, id)).toBeNull();
      vault.clearFor(BRAIN_A, id);
    }
    // The neighbour a traversal was aiming at is untouched, and nothing at all
    // was created for this brain.
    expect(vault.readFor(BRAIN_B, 's1')).toBe('b.one');
    expect(existsSync(join(dir, 'vault', BRAIN_A))).toBe(false);
    expect(readdirSync(join(dir, 'vault'))).toEqual([BRAIN_B]);
  });

  it('refuses an empty or non-string bearer', () => {
    const vault = createVault(dir, codec);
    vault.writeFor(BRAIN_A, 's1', '');
    vault.writeFor(BRAIN_A, 's1', 42);
    expect(vault.readFor(BRAIN_A, 's1')).toBeNull();
  });
});

describe('the update from one slot per brain', () => {
  it('adopts the one-slot bearer into a login: same bearer, and the old file is gone', () => {
    const vault = createVault(dir, codec);
    vault.write(BRAIN_A, 'legacy.bearer');

    expect(vault.adopt(BRAIN_A, 's1')).toBe('legacy.bearer');
    expect(vault.readFor(BRAIN_A, 's1')).toBe('legacy.bearer');
    expect(vault.read(BRAIN_A)).toBeNull();
    expect(existsSync(join(dir, 'vault', `${BRAIN_A}.tok`))).toBe(false);
  });

  it('reads a file written before this build, byte for byte the old format', () => {
    // What index.ts wrote before per-login slots: one file per brain.
    const vault = createVault(dir, codec);
    vault.write(BRAIN_A, 'legacy.bearer');
    const raw = JSON.parse(readFileSync(join(dir, 'vault', `${BRAIN_A}.tok`), 'utf8'));
    expect(raw).toMatchObject({ v: 1, encrypted: true });
    expect(vault.read(BRAIN_A)).toBe('legacy.bearer');
  });

  it('never overwrites a login that already has a bearer of its own', () => {
    const vault = createVault(dir, codec);
    vault.writeFor(BRAIN_A, 's1', 'own.bearer');
    vault.write(BRAIN_A, 'legacy.bearer');

    expect(vault.adopt(BRAIN_A, 's1')).toBe('own.bearer');
    expect(vault.read(BRAIN_A)).toBe('legacy.bearer');
  });

  it('adopts once: a second login finds nothing to take', () => {
    const vault = createVault(dir, codec);
    vault.write(BRAIN_A, 'legacy.bearer');
    vault.adopt(BRAIN_A, 's1');
    expect(vault.adopt(BRAIN_A, 's2')).toBeNull();
  });

  it('with nothing to adopt, answers null and creates nothing', () => {
    const vault = createVault(dir, codec);
    expect(vault.adopt(BRAIN_A, 's1')).toBeNull();
    expect(existsSync(join(dir, 'vault'))).toBe(false);
  });
});

describe('removing a brain', () => {
  it('leaves none of its bearers on disk, and every other brain’s alone', () => {
    const vault = createVault(dir, codec);
    vault.write(BRAIN_A, 'legacy');
    vault.writeFor(BRAIN_A, 's1', 'a.one');
    vault.writeFor(BRAIN_A, 's2', 'a.two');
    vault.writeFor(BRAIN_B, 's1', 'b.one');

    vault.removeProfile(BRAIN_A);

    expect(readdirSync(join(dir, 'vault'))).toEqual([BRAIN_B]);
    expect(vault.readFor(BRAIN_B, 's1')).toBe('b.one');
  });
});
