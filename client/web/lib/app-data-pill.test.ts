import { describe, expect, it } from 'vitest';
import {
  APP_MCP_PILL,
  APP_READ_PILL,
  APP_READ_WRITE_PILL,
  appDataPill,
  appMcpPill,
} from './app-data-pill';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('the R and R/W pill', () => {
  it('shows what the brain sent, never a derived rule', () => {
    expect(appDataPill({ dataAccess: 'read' })).toBe(APP_READ_PILL);
    expect(appDataPill({ dataAccess: 'read_write' })).toBe(APP_READ_WRITE_PILL);
    expect(APP_READ_PILL.label).toBe('R');
    expect(APP_READ_WRITE_PILL.label).toBe('R/W');
  });

  it('shows nothing for an older brain or an unknown value', () => {
    expect(appDataPill({})).toBeNull();
    expect(appDataPill({ dataAccess: 'write' })).toBeNull();
    // Informational alone is not the brain's answer: no pill from it.
    expect(appDataPill({ dataReadOnly: true })).toBeNull();
  });

  it('shows MCP only while the app has MCP access on', () => {
    expect(appMcpPill({ mcpAccess: true })).toBe(APP_MCP_PILL);
    expect(appMcpPill({ mcpAccess: false })).toBeNull();
    expect(appMcpPill({})).toBeNull();
  });

  it('speaks one plain sentence each, with no dash', () => {
    for (const p of [APP_READ_PILL, APP_READ_WRITE_PILL, APP_MCP_PILL]) {
      expect(p.title).toMatch(/\.$/);
      expect(p.title).not.toMatch(DASHES);
    }
  });
});
