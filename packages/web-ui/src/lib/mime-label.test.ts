import { describe, expect, it } from 'vitest';

import { describeFile, fileTypeLabel, KIND_TINT } from './mime-label';

describe('fileTypeLabel', () => {
  it('names the office types a person would recognise', () => {
    expect(
      fileTypeLabel(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'brief.docx',
      ),
    ).toBe('Word document');
    expect(
      fileTypeLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'q3.xlsx'),
    ).toBe('Excel workbook');
    expect(fileTypeLabel('application/pdf', 'sop.pdf')).toBe('PDF');
  });

  it('ignores the charset parameter and the case', () => {
    expect(fileTypeLabel('TEXT/PLAIN; charset=utf-8', 'notes.txt')).toBe('Text');
  });

  it('names a media file by its subtype', () => {
    expect(fileTypeLabel('image/png', 'chart.png')).toBe('PNG image');
    expect(fileTypeLabel('video/mp4', 'clip.mp4')).toBe('MP4 video');
    // A long subtype would make a worse label than the plain family word.
    expect(fileTypeLabel('image/svg+xml', 'logo.svg')).toBe('SVG image');
    expect(fileTypeLabel('audio/vnd.wave', 'take.wav')).toBe('WAVE audio');
  });

  it('falls back to the extension when the server sends octet-stream', () => {
    expect(fileTypeLabel('application/octet-stream', 'plan.dwg')).toBe('DWG file');
    expect(fileTypeLabel('application/octet-stream', 'sheet.xlsx')).toBe('Excel workbook');
  });

  it('says nothing it cannot back up', () => {
    expect(fileTypeLabel('application/octet-stream', 'README')).toBe('File');
    expect(fileTypeLabel(null, null)).toBe('File');
    expect(fileTypeLabel('', '')).toBe('File');
    // A leading dot is a hidden file, not an extension.
    expect(fileTypeLabel('application/octet-stream', '.gitignore')).toBe('File');
  });

  it('treats an unlisted text type as text rather than guessing', () => {
    expect(fileTypeLabel('text/x-yaml', 'compose.yaml')).toBe('Text');
  });
});

describe('describeFile', () => {
  it('pairs every label with a kind and an icon', () => {
    const pdf = describeFile('application/pdf', 'sop.pdf');
    expect(pdf.kind).toBe('pdf');
    expect(pdf.icon).toBeTypeOf('object');

    expect(describeFile('application/zip', 'bundle.zip').kind).toBe('archive');
    expect(describeFile('text/csv', 'rows.csv').kind).toBe('spreadsheet');
    expect(describeFile(null, 'unknown.qqq').kind).toBe('file');
  });
});

describe('KIND_TINT', () => {
  it('carries a class for every kind describeFile can return', () => {
    // The files grid indexes KIND_TINT[described.kind] directly; a kind
    // without an entry would render `undefined` into className.
    for (const [input, expected] of [
      ['application/pdf', 'pdf'],
      ['image/png', 'image'],
      ['audio/ogg', 'audio'],
      ['video/mp4', 'video'],
      ['application/zip', 'archive'],
      ['application/octet-stream', 'file'],
    ] as const) {
      const kind = describeFile(input, null).kind;
      expect(kind).toBe(expected);
      expect(KIND_TINT[kind]).toBeTruthy();
    }
  });
});
