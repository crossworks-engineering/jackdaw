import { describe, expect, it } from 'vitest';
import { folderIndexFace } from './folder-index-face';

const base = {
  known: true,
  pending: false,
  failed: false,
  notFound: false,
  fromHere: true,
  quietHere: false,
  count: 2,
};

describe('folderIndexFace', () => {
  it('shows the label alone while the folder or the reader is not known', () => {
    expect(folderIndexFace({ ...base, known: false })).toBe('label');
    expect(folderIndexFace({ ...base, known: false, pending: true })).toBe('label');
  });

  it('lists, or says the folder is empty', () => {
    expect(folderIndexFace(base)).toBe('list');
    expect(folderIndexFace({ ...base, count: 0 })).toBe('empty');
    expect(folderIndexFace({ ...base, pending: true })).toBe('loading');
  });

  it('a folder the reader cannot open says so: the genuine case keeps its line', () => {
    const hidden = { ...base, failed: true, notFound: true };
    // `here`, where the reader should hold the folder (an own draft, a
    // Library page).
    expect(folderIndexFace(hidden)).toBe('not-shared');
    // A folder named by id, whatever the view.
    expect(folderIndexFace({ ...hidden, fromHere: false })).toBe('not-shared');
    expect(folderIndexFace({ ...hidden, fromHere: false, quietHere: true })).toBe('not-shared');
  });

  it("a reviewer or a teammate reading a draft in its author's own folder gets the label alone", () => {
    expect(
      folderIndexFace({ ...base, failed: true, notFound: true, fromHere: true, quietHere: true }),
    ).toBe('label');
  });

  it('any other failure is a failure, quiet or not', () => {
    expect(folderIndexFace({ ...base, failed: true })).toBe('failed');
    expect(folderIndexFace({ ...base, failed: true, quietHere: true })).toBe('failed');
  });
});
