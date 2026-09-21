import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The token vault: bearers at rest, encrypted with Electron safeStorage (OS
 * keychain-backed: Keychain / DPAPI / libsecret), the mobile companion's
 * posture. Where a keychain is absent (bare Linux) it falls back to a 0600
 * file, which is no worse than the browser's localStorage.
 *
 * A brain window can hold SEVERAL logins, so the vault is keyed twice:
 *
 *   vault/<profileId>.tok               the one slot every shipped build wrote
 *   vault/<profileId>/<sessionId>.tok   one bearer per login held for that brain
 *
 * The profile id is the shell's own (a UUID it minted, resolved from the
 * window that is asking, never taken from the page). The SESSION id comes from
 * the page, so it is the one value here that is validated before it goes
 * anywhere near a path.
 *
 * `adopt` is the upgrade: the one-slot file becomes a login's own file by a
 * rename, so there is no moment at which the bearer exists in neither place
 * and nobody is signed out by updating the app.
 *
 * No Electron import: the codec is handed in, which is what lets this be
 * tested without a keychain.
 */

export type VaultCodec = {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
};

/** What the page may name a session. Generous about length, strict about
 *  alphabet: no dot, no slash, nothing a path could be built from. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID.test(value);
}

export function createVault(baseDir: string, codec: VaultCodec) {
  const legacyFile = (profileId: string) => join(baseDir, 'vault', `${profileId}.tok`);
  const sessionDir = (profileId: string) => join(baseDir, 'vault', profileId);
  const sessionFile = (profileId: string, sessionId: string) =>
    join(sessionDir(profileId), `${sessionId}.tok`);

  function readFile(path: string): string | null {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { encrypted?: boolean; data?: string };
      if (typeof raw.data !== 'string') return null;
      const buf = Buffer.from(raw.data, 'base64');
      return raw.encrypted ? codec.decryptString(buf) : buf.toString('utf8');
    } catch {
      return null;
    }
  }

  function writeFile(path: string, token: string): void {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const encrypted = codec.isEncryptionAvailable();
    const data = encrypted ? codec.encryptString(token) : Buffer.from(token, 'utf8');
    writeFileSync(path, JSON.stringify({ v: 1, encrypted, data: data.toString('base64') }), {
      mode: 0o600,
    });
  }

  return {
    /** The one-slot bearer, as every build before this one stored it. */
    read: (profileId: string) => readFile(legacyFile(profileId)),
    write: (profileId: string, token: string) => writeFile(legacyFile(profileId), token),
    clear: (profileId: string) => rmSync(legacyFile(profileId), { force: true }),

    readFor(profileId: string, sessionId: unknown): string | null {
      return isSessionId(sessionId) ? readFile(sessionFile(profileId, sessionId)) : null;
    },
    writeFor(profileId: string, sessionId: unknown, token: unknown): void {
      if (!isSessionId(sessionId) || typeof token !== 'string' || token.length === 0) return;
      writeFile(sessionFile(profileId, sessionId), token);
    },
    clearFor(profileId: string, sessionId: unknown): void {
      if (isSessionId(sessionId)) rmSync(sessionFile(profileId, sessionId), { force: true });
    },

    /**
     * Give the one-slot bearer to a login, and answer with it. A login that
     * already has a bearer of its own keeps it, and the one slot is left alone:
     * adopting is for the login that has nothing yet.
     */
    adopt(profileId: string, sessionId: unknown): string | null {
      if (!isSessionId(sessionId)) return null;
      const target = sessionFile(profileId, sessionId);
      if (existsSync(target)) return readFile(target);
      const legacy = legacyFile(profileId);
      if (!existsSync(legacy)) return null;
      try {
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        renameSync(legacy, target);
      } catch {
        return null;
      }
      return readFile(target);
    },

    /** A brain was removed from the app: nothing of it stays on disk. */
    removeProfile(profileId: string): void {
      rmSync(legacyFile(profileId), { force: true });
      rmSync(sessionDir(profileId), { recursive: true, force: true });
    },
  };
}

export type Vault = ReturnType<typeof createVault>;
