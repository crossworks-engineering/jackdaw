import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { folderIndexFace } from './folder-index-face';

const base = {
  known: true,
  pending: false,
  failed: false,
  notFound: false,
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

  it('a folder the reader cannot open says so', () => {
    expect(folderIndexFace({ ...base, failed: true, notFound: true })).toBe('not-shared');
  });

  it('any other failure is a failure', () => {
    expect(folderIndexFace({ ...base, failed: true })).toBe('failed');
  });
});

describe('no quiet `here` (W5c: no teammate drafts, no reviewers)', () => {
  it('the read-only views take no quietHere', () => {
    for (const f of [
      './folder-index-face.ts',
      './folder-index-list.tsx',
      './static-doc.tsx',
      './page-view.tsx',
    ]) {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
      expect(src, f).not.toContain('quietHere');
    }
  });
});
