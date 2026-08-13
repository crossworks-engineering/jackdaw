import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCALIDRAW_ENGINE } from '@mantle/client-types/version';

/**
 * The client half of the excalidraw-engine tripwire (the server half lives in
 * mantle's server/web/lib/excalidraw-engine.test.ts). Both renderers stamp
 * EXCALIDRAW_ENGINE onto stored draw snapshots, so this app's pin must equal
 * the contract constant — a drift means two different renderers writing the
 * same stamp.
 */
describe('EXCALIDRAW_ENGINE', () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  const pin = pkg.dependencies?.['@excalidraw/excalidraw'];

  it('matches the pin declared by client/web', () => {
    expect(pin).toBe(EXCALIDRAW_ENGINE);
  });

  it('is pinned exactly, so the stamp cannot drift under us', () => {
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
