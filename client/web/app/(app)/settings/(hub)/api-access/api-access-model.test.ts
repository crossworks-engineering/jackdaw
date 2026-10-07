/**
 * Settings > API access, the pure half: the create body the dialog sends,
 * the scope line, the list order and the example commands.
 */
import { describe, expect, it } from 'vitest';
import type { AccessKeyView } from '@mantle/client-types';
import {
  createBody,
  defaultExpiryChoice,
  exampleCommands,
  scopeLine,
  sortKeys,
  type CreateForm,
} from './api-access-model';

const form = (patch: Partial<CreateForm> = {}): CreateForm => ({
  name: 'Backup script',
  access: 'read',
  allAreas: true,
  areas: [],
  expiry: '90',
  riskyTools: '',
  ...patch,
});

const key = (patch: Partial<AccessKeyView>): AccessKeyView => ({
  id: 'k',
  name: 'k',
  prefix: 'mtlk_abcdefgh',
  login: { id: 'l', email: 'a@example.com', displayName: null, role: 'admin' },
  access: 'read',
  areas: null,
  riskyTools: [],
  status: 'active',
  expiresAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: null,
  lastUsedAt: null,
  lastUsedIp: null,
  revokedAt: null,
  ...patch,
});

describe('API access: create body', () => {
  it('sends all areas as null, never a login, and the expiry in days', () => {
    expect(createBody(form(), true)).toEqual({
      body: { name: 'Backup script', access: 'read', areas: null, expiresInDays: 90 },
    });
    const never = createBody(form({ expiry: 'never', access: 'read_write' }), false);
    expect(never).toEqual({
      body: { name: 'Backup script', access: 'read_write', areas: null, expiresInDays: null },
    });
  });

  it('sends the ticked areas once each', () => {
    const r = createBody(form({ allAreas: false, areas: ['tasks', 'pages', 'tasks'] }), false);
    expect('body' in r && r.body.areas).toEqual(['tasks', 'pages']);
  });

  it('names the field that is wrong', () => {
    expect(createBody(form({ name: '  ' }), true)).toMatchObject({ field: 'name' });
    expect(createBody(form({ allAreas: false, areas: [] }), true)).toMatchObject({
      field: 'areas',
    });
    expect(createBody(form({ riskyTools: 'email_send, Bad-Name' }), true)).toMatchObject({
      field: 'riskyTools',
    });
  });

  it('sends risky tools for an admin only', () => {
    const admin = createBody(form({ riskyTools: 'web_search, email_send web_search' }), true);
    expect('body' in admin && admin.body.riskyTools).toEqual(['web_search', 'email_send']);
    const member = createBody(form({ riskyTools: 'web_search' }), false);
    expect('body' in member && member.body.riskyTools).toBeUndefined();
  });

  it('starts on the brain default expiry when it is a choice', () => {
    expect(defaultExpiryChoice(90)).toBe('90');
    expect(defaultExpiryChoice(30)).toBe('30');
    expect(defaultExpiryChoice(45)).toBe('90');
  });
});

describe('API access: list', () => {
  it('says what a key may do', () => {
    expect(scopeLine(key({}))).toBe('Read only · All areas');
    expect(scopeLine(key({ access: 'read_write', areas: ['tasks', 'files'] }))).toBe(
      'Read and write · Tasks, Files',
    );
  });

  it('puts live keys first, newest first', () => {
    const sorted = sortKeys([
      key({ id: 'old', createdAt: '2026-09-01T00:00:00.000Z' }),
      key({ id: 'revoked', status: 'revoked', createdAt: '2026-10-05T00:00:00.000Z' }),
      key({ id: 'new', createdAt: '2026-10-02T00:00:00.000Z' }),
    ]);
    expect(sorted.map((k) => k.id)).toEqual(['new', 'old', 'revoked']);
  });

  it('builds the example commands on the brain origin', () => {
    const ex = exampleCommands('https://brain.example.com', 'mtlk_abcdefgh_secret');
    expect(ex.http).toContain('https://brain.example.com/api/v1/whoami');
    expect(ex.http).toContain('Authorization: Bearer mtlk_abcdefgh_secret');
    expect(ex.mcp).toContain('https://brain.example.com/api/mcp');
  });
});
