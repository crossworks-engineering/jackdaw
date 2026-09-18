import { describe, expect, it, vi } from 'vitest';
import {
  chatUploadFolder,
  needsIndexWait,
  planAttachments,
  waitUntilIndexed,
} from './chat-uploads';

describe('chatUploadFolder', () => {
  it('matches the server: dashed slugs on disk, underscored ltree labels, UTC date', () => {
    // 23:30 in UTC-2 is already the next day in UTC; the server stamps UTC, so
    // the client must too or the two roads split one day across two folders.
    const f = chatUploadFolder(new Date('2026-09-18T23:30:00-02:00'));
    expect(f.path).toBe('files.assistant_uploads.2026_09_19');
    expect(f.ensure.map(([parent, slug]) => [parent, slug])).toEqual([
      ['files', 'assistant-uploads'],
      ['files.assistant_uploads', '2026-09-19'],
    ]);
  });
});

describe('needsIndexWait', () => {
  it('waits for office documents, whose text only exists after extraction', () => {
    for (const name of ['a.pdf', 'b.DOCX', 'c.xlsx', 'd.xls']) {
      expect(needsIndexWait({ name, type: '' })).toBe(true);
    }
  });

  it('does not wait for images or text files: their bytes are readable at once', () => {
    expect(needsIndexWait({ name: 'shot.png', type: 'image/png' })).toBe(false);
    for (const name of ['n.md', 'n.txt', 'n.csv', 'n.json', 'n.yaml']) {
      expect(needsIndexWait({ name, type: '' })).toBe(false);
    }
  });
});

describe('planAttachments', () => {
  const base = { hasInline: false, contextCount: 0, pendingLinked: 0, maxContext: 10 };

  it('gives the first file the inline slot and links the rest', () => {
    expect(planAttachments(['a', 'b', 'c'], base)).toEqual({
      inline: 'a',
      linked: ['b', 'c'],
      overflow: [],
    });
  });

  it('links everything when the inline slot is already taken', () => {
    expect(planAttachments(['b', 'c'], { ...base, hasInline: true })).toEqual({
      inline: null,
      linked: ['b', 'c'],
      overflow: [],
    });
  });

  it('a single file with a free slot is exactly the old behaviour', () => {
    expect(planAttachments(['a'], base)).toEqual({ inline: 'a', linked: [], overflow: [] });
  });

  it('counts refs already attached AND uploads still in flight against the cap', () => {
    const plan = planAttachments(['b', 'c', 'd'], {
      hasInline: true,
      contextCount: 7,
      pendingLinked: 2,
      maxContext: 10,
    });
    expect(plan.linked).toEqual(['b']);
    expect(plan.overflow).toEqual(['c', 'd']);
  });

  it('the inline slot is not a context ref, so it survives a full cap', () => {
    const plan = planAttachments(['a', 'b'], { ...base, contextCount: 10 });
    expect(plan).toEqual({ inline: 'a', linked: [], overflow: ['b'] });
  });
});

describe('waitUntilIndexed', () => {
  const row = (applied: 'full' | null) => ({
    id: 'f',
    filename: 'a.pdf',
    indexingApplied: applied,
  });

  it('resolves true once the extractor has run', async () => {
    const rows = [row(null), row(null), row('full')];
    const fetchRow = vi.fn(async () => rows.shift() ?? row('full'));
    const ok = await waitUntilIndexed('f', { fetchRow, sleep: async () => {}, now: () => 0 });
    expect(ok).toBe(true);
    expect(fetchRow).toHaveBeenCalledTimes(3);
  });

  it('resolves false at the deadline instead of hanging the composer', async () => {
    let t = 0;
    const ok = await waitUntilIndexed('f', {
      fetchRow: async () => row(null),
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
      timeoutMs: 5000,
      pollMs: 2000,
    });
    expect(ok).toBe(false);
  });

  it('keeps polling through a failed request', async () => {
    let n = 0;
    const ok = await waitUntilIndexed('f', {
      fetchRow: async () => {
        n += 1;
        if (n === 1) throw new Error('network');
        return row('full');
      },
      sleep: async () => {},
      now: () => 0,
    });
    expect(ok).toBe(true);
  });

  it('stops when cancelled (the composer unmounted)', async () => {
    const fetchRow = vi.fn(async () => row(null));
    const ok = await waitUntilIndexed('f', { fetchRow, isCancelled: () => true });
    expect(ok).toBe(false);
    expect(fetchRow).not.toHaveBeenCalled();
  });
});
