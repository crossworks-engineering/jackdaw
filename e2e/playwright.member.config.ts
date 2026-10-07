import { defineConfig } from '@playwright/test';
import { MOCK_API_ORIGIN, MOCK_DESKTOP_BRAIN_KEY } from './member/mock-member-api';

/**
 * The member specs: NO brain. Every /api/* request goes to an in-memory
 * member API the spec starts in its own process (member/mock-member-api.ts),
 * so these run on any machine with this checkout and nothing else:
 * `pnpm e2e:member`.
 *
 * The owner UI runs from THIS checkout (next dev) with MANTLE_SERVER_ORIGIN
 * pointed at that mock. Kept apart from playwright.config.ts on purpose: that
 * one's global-setup signs in to a real brain, which is exactly what these
 * specs must not need.
 *
 * Next allows one `next dev` per project directory, so stop a dev server
 * running in client/web first (or set E2E_MEMBER_URL to one already serving
 * this checkout with MANTLE_SERVER_ORIGIN set to MOCK_API_ORIGIN).
 */
const PORT = Number(process.env.E2E_MEMBER_PORT || 3911);
const external = process.env.E2E_MEMBER_URL?.replace(/\/+$/, '');
const baseURL = external || `http://localhost:${PORT}`;
// E2E_BROWSER_CHANNEL=chrome drives the installed Chrome instead of
// Playwright's bundled build (a machine whose browsers lag the package).
const channel = process.env.E2E_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: './member',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // The first request compiles the route in dev; the specs themselves are fast.
  timeout: 120_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
    ...(channel ? { channel } : {}),
  },
  ...(external
    ? {}
    : {
        webServer: {
          command: 'pnpm -C ../client/web exec next dev --port ' + PORT,
          url: `${baseURL}/env.js`,
          reuseExistingServer: false,
          timeout: 180_000,
          // The brain is the spec's in-memory member API, never a real one.
          // The desktop shell's per-launch key, so a spec can name a window's
          // brain the way the shell does (login-brains.spec.ts).
          env: {
            MANTLE_SERVER_ORIGIN: MOCK_API_ORIGIN,
            NEXT_PUBLIC_MANTLE_API_BASE: '',
            MANTLE_DESKTOP_BRAIN_KEY: MOCK_DESKTOP_BRAIN_KEY,
          },
        },
      }),
});
