import { expect, test } from '../lib/fixtures';

/**
 * /app-runtime — the mini-app runtime served with ACAO:* for opaque-origin
 * (Origin: null) sandboxed iframes. Only the BRAIN serves it: every sandbox
 * frames a brain-rendered document whose import map points at the brain's
 * copy, whichever origin the owner UI runs on. So this checks serverURL in
 * both projects; the client origin has no copy of its own.
 */
test.describe('app-runtime', () => {
  test('manifest + a module are served with ACAO:*', async ({ serverURL, playwright }) => {
    const anon = await playwright.request.newContext();
    try {
      const manifest = await anon.get(`${serverURL}/app-runtime/manifest.json`, {
        headers: { Origin: 'null' },
        failOnStatusCode: false,
      });
      expect(manifest.status()).toBe(200);
      expect(manifest.headers()['access-control-allow-origin']).toBe('*');

      // Import-map shape: { imports: { specifier: "/app-runtime/<hash>.js" } }
      const { imports } = (await manifest.json()) as { imports: Record<string, string> };
      const first = Object.values(imports ?? {}).find(
        (v) => typeof v === 'string' && v.endsWith('.js'),
      );
      expect(first, 'manifest lists at least one module').toBeTruthy();

      const mod = await anon.get(`${serverURL}${first as string}`, {
        headers: { Origin: 'null' },
        failOnStatusCode: false,
      });
      expect(mod.status()).toBe(200);
      expect(mod.headers()['access-control-allow-origin']).toBe('*');
      expect(mod.headers()['content-type'] ?? '').toContain('javascript');
    } finally {
      await anon.dispose();
    }
  });
});
