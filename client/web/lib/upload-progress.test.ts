import { describe, it, expect } from 'vitest';
import {
  aggregateProgress,
  etaSeconds,
  formatBytes,
  formatEta,
  formatRate,
  overLimitMessage,
  updateRate,
} from './upload-progress';

describe('formatting', () => {
  it('formats bytes at a sensible precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2.5 * 1024)).toBe('2.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
  });
  it('formats rate and eta', () => {
    expect(formatRate(3.1 * 1024 * 1024)).toBe('3.1 MB/s');
    expect(formatRate(null)).toBe('');
    expect(formatEta(2)).toBe('almost done');
    expect(formatEta(45)).toBe('45s left');
    expect(formatEta(80)).toBe('1m 20s left');
    expect(formatEta(3725)).toBe('1h 2m left');
  });
  it('says both numbers when refusing a file', () => {
    expect(overLimitMessage(250 * 1024 * 1024, 64 * 1024 * 1024)).toBe(
      'File is 250 MB. The limit is 64 MB.',
    );
  });
});

describe('rate + eta', () => {
  it('seeds then smooths the rate', () => {
    const r1 = updateRate(null, 1000, 1000);
    expect(r1).toBe(1000);
    const r2 = updateRate(r1, 3000, 1000);
    expect(r2).toBeCloseTo(1600);
    expect(updateRate(r2, 10, 0)).toBe(r2);
  });
  it('derives eta from what is left', () => {
    expect(etaSeconds(50, 100, 10)).toBe(5);
    expect(etaSeconds(50, 100, null)).toBeNull();
    expect(etaSeconds(150, 100, 10)).toBe(0);
  });
});

describe('aggregateProgress', () => {
  it('counts bytes, not files, and skips failed or cancelled tasks', () => {
    const agg = aggregateProgress([
      { status: 'done', size: 100, loaded: 100, rate: null },
      { status: 'uploading', size: 900, loaded: 300, rate: 100 },
      { status: 'pending', size: 1000, loaded: 0, rate: null },
      { status: 'error', size: 5000, loaded: 0, rate: null },
      { status: 'cancelled', size: 5000, loaded: 10, rate: null },
    ]);
    expect(agg.total).toBe(2000);
    expect(agg.loaded).toBe(400);
    expect(agg.pct).toBe(20);
    expect(agg.rate).toBe(100);
    expect(agg.etaSec).toBe(16);
  });
  it('is quiet when nothing is queued', () => {
    expect(aggregateProgress([])).toEqual({
      loaded: 0,
      total: 0,
      pct: 0,
      rate: null,
      etaSec: null,
    });
  });
});
