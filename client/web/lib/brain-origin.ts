// Server-module only (reads the request's headers). Do not import from client
// components.
import { headers } from 'next/headers';
import {
  DESKTOP_BRAIN_HEADER,
  DESKTOP_BRAIN_KEY_HEADER,
  resolveBrainOrigin,
} from './desktop-brain';

/**
 * The origin of the brain this request renders for: `MANTLE_SERVER_ORIGIN`,
 * or in the desktop shell the window's own brain (lib/desktop-brain.ts). Every
 * server-side read of the brain origin goes through here, never through
 * `process.env` directly, or a second brain's window renders the first one.
 */
export async function brainOrigin(): Promise<string> {
  const h = await headers();
  return resolveBrainOrigin(
    {
      serverOrigin: process.env.MANTLE_SERVER_ORIGIN,
      desktopKey: process.env.MANTLE_DESKTOP_BRAIN_KEY,
    },
    { brain: h.get(DESKTOP_BRAIN_HEADER), key: h.get(DESKTOP_BRAIN_KEY_HEADER) },
  );
}
