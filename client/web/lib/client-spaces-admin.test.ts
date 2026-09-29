import { describe, expect, it } from 'vitest';
import { clientActionConfirm } from './client-logins';
import {
  CLIENT_COMMENTS_PATH,
  clientCommentsPath,
  commentItemHref,
  commentRowLine,
  deletedCommentsText,
  nearCap,
  refusalLine,
  refusalReasonLabel,
  storageLimitsText,
  storageRowLine,
  storageRowName,
  storageTotalLine,
} from './client-spaces-admin';
import type { ClientStorageUsage } from '@mantle/client-types';

/**
 * Team admin > Clients, the C5 audit fixes' cards: client storage against
 * the caps, and the week's client comments with a per-client delete.
 */
const MB = 1024 * 1024;
const limits: ClientStorageUsage['limits'] = {
  fileMaxBytes: 20 * MB,
  perClientBytes: 200 * MB,
  dailyUploadBytes: 50 * MB,
  itemLimit: 500,
  totalBytes: 5 * 1024 * MB,
  submitsPerDay: 10,
  openSubmissions: 50,
};
const row = (over: Partial<ClientStorageUsage['rows'][number]> = {}) => ({
  loginId: 'l-1',
  name: 'Pat Client',
  usedBytes: 12 * MB,
  uploadedTodayBytes: 0,
  items: 34,
  openSubmissions: 0,
  former: false,
  ...over,
});

describe('client storage', () => {
  it('says the total against the brain’s total', () => {
    expect(storageTotalLine({ totalUsedBytes: 1536 * MB, limits })).toBe(
      '1.50 GB of 5.00 GB used by all client spaces',
    );
  });

  it('names every cap once', () => {
    expect(storageLimitsText(limits)).toBe(
      'Each client may keep 200 MB and 500 items, upload 50 MB a day (20 MB a file), and submit 10 a day with 50 waiting at most.',
    );
  });

  it('a client’s use, its waiting and today’s uploads only when there are some', () => {
    expect(storageRowLine(row(), limits)).toBe('12 MB of 200 MB · 34 of 500 items');
    expect(storageRowLine(row({ openSubmissions: 2, uploadedTodayBytes: 3 * MB }), limits)).toBe(
      '12 MB of 200 MB · 34 of 500 items · 2 waiting for review · 3.0 MB uploaded today',
    );
  });

  it('names a row as the brain does, a deleted client too', () => {
    expect(storageRowName(row())).toBe('Pat Client');
    expect(storageRowName(row({ name: 'Former client (3)', former: true }))).toBe(
      'Former client (3)',
    );
  });

  it('warns from 90% of a cap', () => {
    expect(nearCap(179 * MB, 200 * MB)).toBe(false);
    expect(nearCap(180 * MB, 200 * MB)).toBe(true);
    expect(nearCap(1, 0)).toBe(false);
  });

  it('a refusal: when, whose, which cap in words; an unknown cap as given', () => {
    const at = '2026-09-29T10:00:00.000Z';
    expect(refusalLine({ at, loginId: 'l-1', reason: 'daily-upload' }, [row()])).toMatch(
      / · Pat Client · the day's uploads are used up$/,
    );
    expect(refusalLine({ at, loginId: null, reason: 'total' }, [row()])).toMatch(
      / · A client no longer here · all client spaces are full$/,
    );
    expect(refusalLine({ at, loginId: 'l-1', reason: 'new-cap' }, [row()])).toMatch(/ · new-cap$/);
    for (const reason of [
      'file-size',
      'storage',
      'upload-no-room',
      'items',
      'submits-per-day',
      'open-submissions',
      'comment-cap',
      'thread-full',
      'give-back',
    ]) {
      expect(refusalReasonLabel(reason)).not.toBe(reason);
    }
  });
});

describe('client comments', () => {
  it('asks the week, and deletes one client’s comments by id, encoded', () => {
    expect(CLIENT_COMMENTS_PATH).toBe('/api/team-admin/clients/comments?days=7');
    expect(clientCommentsPath('a/b')).toBe('/api/team-admin/clients/a%2Fb/comments');
    expect(commentItemHref('n 1')).toBe('/n/n%201');
  });

  it('a row: how many, and the last by whom', () => {
    const r = {
      nodeId: 'n-1',
      title: 'Design brief',
      type: 'page',
      lastCommentAt: '2026-09-29T10:00:00.000Z',
      clientComments: 1,
      lastClientName: 'Pat Client',
    };
    expect(commentRowLine(r)).toMatch(/^1 client comment · the last by Pat Client, /);
    expect(commentRowLine({ ...r, clientComments: 3 })).toMatch(/^3 client comments · /);
  });

  it('confirms before deleting, and says how many went', () => {
    const who = { displayName: 'Pat Client', email: 'pat@example.invalid' };
    const c = clientActionConfirm('comments', who);
    expect(c.title).toBe('Delete every comment Pat Client wrote?');
    expect(c.body).toMatch(/cannot be undone/);
    expect(c.action).toBe('Delete comments');
    expect(deletedCommentsText(who, 3)).toBe('Deleted 3 comments by Pat Client.');
    expect(deletedCommentsText(who, 1)).toBe('Deleted 1 comment by Pat Client.');
    expect(deletedCommentsText(who, 0)).toBe('Pat Client had no comments to delete.');
  });
});
