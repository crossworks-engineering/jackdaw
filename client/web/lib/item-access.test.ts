import { describe, expect, it } from 'vitest';
import { SNAPSHOT_COPY_NOTE, isReadOnlyItem } from './item-access';

describe('isReadOnlyItem (W6b snapshot copies)', () => {
  it('is read only when the brain says readOnly, or names the item it copies', () => {
    expect(isReadOnlyItem({ readOnly: true })).toBe(true);
    expect(isReadOnlyItem({ snapshotOf: 'n1' })).toBe(true);
  });

  it('is not when the brain says nothing, or says no', () => {
    expect(isReadOnlyItem({})).toBe(false);
    expect(isReadOnlyItem({ readOnly: false })).toBe(false);
    expect(isReadOnlyItem({ readOnly: 'true' })).toBe(false);
    expect(isReadOnlyItem({ snapshotOf: '' })).toBe(false);
    expect(isReadOnlyItem({ snapshotOf: null })).toBe(false);
    expect(isReadOnlyItem(null)).toBe(false);
    expect(isReadOnlyItem(undefined)).toBe(false);
  });

  it('says it plainly, with no dash', () => {
    expect(SNAPSHOT_COPY_NOTE).toMatch(/read only/);
    expect(SNAPSHOT_COPY_NOTE).not.toMatch(/[–—]/);
  });
});
