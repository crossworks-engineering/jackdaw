import { describe, expect, it } from 'vitest';
import {
  exportResultText,
  isExportBusy,
  unexportedText,
  type ForumExportResult,
} from './forum-closed';

describe('isExportBusy', () => {
  it('is the 409 with reason busy only', () => {
    expect(isExportBusy(409, { error: 'running', reason: 'busy' })).toBe(true);
    expect(isExportBusy(409, { error: 'conflict' })).toBe(false);
    expect(isExportBusy(500, { reason: 'busy' })).toBe(false);
    expect(isExportBusy(409, undefined)).toBe(false);
  });
});

const run = (over: Partial<ForumExportResult>): ForumExportResult => ({
  status: 'done',
  exported: 0,
  deferred: 0,
  alreadyExported: 0,
  archivePageId: 'p1',
  dumpFileId: null,
  uploadsFiled: 0,
  uploadsMissing: 0,
  tasksLinked: 0,
  ...over,
});

describe('exportResultText', () => {
  it('says what a first run did, with every count', () => {
    expect(
      exportResultText(
        run({ exported: 12, deferred: 1, uploadsFiled: 3, uploadsMissing: 2, tasksLinked: 4 }),
      ),
    ).toBe(
      'Exported 12 topics to Pages. 1 topic waits for a reply still in progress; export again later. ' +
        'Filed 3 unreviewed uploads into files/review. 2 uploads had no file left to keep. ' +
        'Linked 4 request tasks to the archive.',
    );
  });

  it('uses the singular for one', () => {
    expect(
      exportResultText(
        run({
          exported: 1,
          alreadyExported: 1,
          uploadsFiled: 1,
          uploadsMissing: 1,
          tasksLinked: 1,
        }),
      ),
    ).toBe(
      'Exported 1 topic to Pages. 1 was already there. Filed 1 unreviewed upload into files/review. ' +
        '1 upload had no file left to keep. Linked 1 request task to the archive.',
    );
  });

  it('a run that found everything exported says so', () => {
    expect(exportResultText(run({ alreadyExported: 7 }))).toBe(
      'Nothing new to export: 7 topics are already in the archive.',
    );
    expect(exportResultText(run({ exported: 2, alreadyExported: 5 }))).toBe(
      'Exported 2 topics to Pages. 5 were already there.',
    );
  });

  it('a run with only deferred topics does not claim an empty forum', () => {
    expect(exportResultText(run({ deferred: 2 }))).toBe(
      '2 topics wait for a reply still in progress; export again later.',
    );
  });

  it('an empty forum', () => {
    expect(exportResultText(run({ archivePageId: null }))).toBe(
      'The forum has no topics to export.',
    );
  });
});

describe('unexportedText', () => {
  it('counts what is left, or says all is in', () => {
    expect(unexportedText(0)).toBe('Every topic is in the Forum archive.');
    expect(unexportedText(1)).toBe('1 topic is not in the Forum archive yet.');
    expect(unexportedText(9)).toBe('9 topics are not in the Forum archive yet.');
  });
});
