import { describe, expect, it } from 'vitest';
import {
  NO_EDIT_NOTE,
  SNAPSHOT_COPY_NOTE,
  isReadOnlyItem,
  itemAccess,
  readOnlyNote,
} from './item-access';

describe('isReadOnlyItem (W6b snapshot copies)', () => {
  it('is read only when the brain says readOnly, or names the item it copies', () => {
    expect(isReadOnlyItem({ readOnly: true })).toBe(true);
    expect(isReadOnlyItem({ snapshotOf: 'n1' })).toBe(true);
    expect(isReadOnlyItem({ readOnly: true, snapshotOf: 'n1', mayManage: true })).toBe(true);
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
    expect(NO_EDIT_NOTE).not.toMatch(/[–—]/);
  });
});

describe('itemAccess (W6b fix round: the item caps)', () => {
  it('leaves every control on when the brain sends no caps', () => {
    expect(itemAccess({})).toEqual({
      copy: false,
      edit: true,
      manage: true,
      move: true,
      share: true,
    });
    expect(itemAccess(null).edit).toBe(true);
  });

  it('a Moderator of the home: everything', () => {
    expect(itemAccess({ mayEdit: true, mayManage: true })).toEqual({
      copy: false,
      edit: true,
      manage: true,
      move: true,
      share: true,
    });
  });

  it('a Write grant: edit, but no Delete, Move or Grant Access', () => {
    expect(itemAccess({ mayEdit: true, mayManage: false })).toEqual({
      copy: false,
      edit: true,
      manage: false,
      move: false,
      share: false,
    });
  });

  it('a read grant: no editor and no Delete, Move or Grant Access', () => {
    expect(itemAccess({ mayEdit: false, mayManage: false })).toEqual({
      copy: false,
      edit: false,
      manage: false,
      move: false,
      share: false,
    });
  });

  it('a snapshot copy for its author: Delete only', () => {
    const copy = { mayEdit: false, mayManage: true, readOnly: true, snapshotOf: 'n1' };
    expect(itemAccess(copy)).toEqual({
      copy: true,
      edit: false,
      manage: true,
      move: false,
      share: false,
    });
    // Even if a brain said mayEdit on a copy, the copy stays read only.
    expect(itemAccess({ ...copy, mayEdit: true }).edit).toBe(false);
  });

  it('only a real false turns a control off', () => {
    expect(itemAccess({ mayEdit: 'false', mayManage: 0 }).edit).toBe(true);
    expect(itemAccess({ mayEdit: 'false', mayManage: 0 }).manage).toBe(true);
  });
});

describe('readOnlyNote', () => {
  it('names a copy, a read-only item, or nothing', () => {
    expect(readOnlyNote(itemAccess({ readOnly: true, mayManage: true }))).toBe(SNAPSHOT_COPY_NOTE);
    expect(readOnlyNote(itemAccess({ mayEdit: false }))).toBe(NO_EDIT_NOTE);
    expect(readOnlyNote(itemAccess({ mayEdit: true }))).toBeNull();
    expect(readOnlyNote(itemAccess({}))).toBeNull();
  });
});
