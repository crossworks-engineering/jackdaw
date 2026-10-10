/**
 * Settings > API access, the pure half: the create body the dialog sends,
 * the scope line, the list order and the example commands.
 */
import { describe, expect, it } from 'vitest';
import type { AccessKeyView } from '@mantle/client-types';
import {
  createBody,
  defaultExpiryChoice,
  expiryChoicesFor,
  exampleCommands,
  scopeLine,
  sortKeys,
  type CreateForm,
} from './api-access-model';

const form = (patch: Partial<CreateForm> = {}): CreateForm => ({
  name: 'Backup script',
  expiry: '90',
  riskyTools: '',
  password: '',
  ...patch,
});

const ADMIN = { isAdmin: true, needsPassword: false, maxExpiryDays: null };
const MEMBER = { isAdmin: false, needsPassword: false, maxExpiryDays: 90 };

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
  it('a key acts as its login (contract 25): read and write, every area, never a login', () => {
    expect(createBody(form(), ADMIN)).toEqual({
      body: { name: 'Backup script', access: 'read_write', areas: null, expiresInDays: 90 },
    });
    const never = createBody(form({ expiry: 'never' }), ADMIN);
    expect(never).toEqual({
      body: { name: 'Backup script', access: 'read_write', areas: null, expiresInDays: null },
    });
    const member = createBody(form(), MEMBER);
    expect('body' in member && member.body).toMatchObject({ access: 'read_write', areas: null });
  });

  it('names the field that is wrong', () => {
    expect(createBody(form({ name: '  ' }), ADMIN)).toMatchObject({ field: 'name' });
    expect(createBody(form({ riskyTools: 'email_send, Bad-Name' }), ADMIN)).toMatchObject({
      field: 'riskyTools',
    });
  });

  it('sends risky tools for an admin only', () => {
    const admin = createBody(form({ riskyTools: 'web_search, email_send web_search' }), ADMIN);
    expect('body' in admin && admin.body.riskyTools).toEqual(['web_search', 'email_send']);
    const member = createBody(form({ riskyTools: 'web_search' }), MEMBER);
    expect('body' in member && member.body.riskyTools).toBeUndefined();
  });

  it('starts on the brain default expiry when it is a choice', () => {
    expect(defaultExpiryChoice(90)).toBe('90');
    expect(defaultExpiryChoice(30)).toBe('30');
    expect(defaultExpiryChoice(45)).toBe('365');
    expect(defaultExpiryChoice(90, 30)).toBe('30');
  });

  it('offers a member up to 90 days, a client up to 30, never only to an admin', () => {
    expect(expiryChoicesFor(null)).toEqual(['30', '90', '365', 'never']);
    expect(expiryChoicesFor(90)).toEqual(['30', '90']);
    expect(expiryChoicesFor(30)).toEqual(['30']);
    expect(createBody(form({ expiry: 'never' }), MEMBER)).toMatchObject({ field: 'expiry' });
    expect(createBody(form({ expiry: '365' }), MEMBER)).toMatchObject({ field: 'expiry' });
  });

  it('sends the password only when the brain asks for it', () => {
    const rules = { ...MEMBER, needsPassword: true };
    expect(createBody(form(), rules)).toMatchObject({ field: 'password' });
    const ok = createBody(form({ password: 'secret words' }), rules);
    expect('body' in ok && ok.body.password).toBe('secret words');
    const client = createBody(form({ password: 'ignored', expiry: '30' }), {
      isAdmin: false,
      needsPassword: false,
      maxExpiryDays: 30,
    });
    expect('body' in client && client.body.password).toBeUndefined();
  });
});

describe('API access: list', () => {
  it('says a key has its login rights, whatever an old key stored', () => {
    expect(scopeLine(key({}))).toBe('Same rights as its login');
    expect(scopeLine(key({ access: 'read', areas: ['search'] }))).toBe('Same rights as its login');
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
    expect(ex.env).toBe("export MANTLE_KEY='mtlk_abcdefgh_secret'");
    expect(ex.http).toContain('https://brain.example.com/api/v1/whoami');
    expect(ex.http).toContain('Authorization: Bearer $MANTLE_KEY');
    expect(ex.mcp).toContain('https://brain.example.com/api/mcp');
    // The secret is on the export line only.
    expect(ex.http).not.toContain('mtlk_');
    expect(ex.mcp).not.toContain('mtlk_');
  });
});
