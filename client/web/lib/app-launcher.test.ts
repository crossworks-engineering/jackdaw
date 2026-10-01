import { describe, expect, it } from 'vitest';
import {
  appCountLabel,
  flatLauncherLevel,
  launcherLevel,
  type AppLauncherFolder,
} from './app-launcher';

/**
 * One level of an Apps launcher from the brain's `folders` (a member's and a
 * client's alike): the grouping, the fallback for a brain that sends none,
 * and the promise that no bad shape ever hides an app.
 */
const card = (id: string) => ({ id, title: id });
const folder = (
  id: string,
  parentId: string | null,
  appIds: string[],
  look: Partial<AppLauncherFolder> = {},
): AppLauncherFolder => ({
  id,
  name: `Folder ${id}`,
  icon: null,
  color: null,
  parentId,
  appIds,
  ...look,
});
const source = (apps: string[], folders?: AppLauncherFolder[] | null) => ({
  apps: apps.map(card),
  folders,
});
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe('launcherLevel', () => {
  it('an older brain (no folders) is one flat level', () => {
    for (const folders of [undefined, null]) {
      const top = launcherLevel(source(['a', 'b'], folders), null)!;
      expect(top.folder).toBeNull();
      expect(top.crumbs).toEqual([]);
      expect(top.folders).toEqual([]);
      expect(ids(top.apps)).toEqual(['a', 'b']);
    }
    // And a folder link from a newer visit is no folder there.
    expect(launcherLevel(source(['a']), 'f1')).toBeNull();
  });

  it('shows folders next to the apps no folder names, at the top level', () => {
    const top = launcherLevel(
      source(
        ['a', 'b', 'c'],
        [folder('f1', null, ['b'], { icon: 'lucide:rocket', color: 'teal' })],
      ),
      null,
    )!;
    expect(top.folders).toEqual([
      { id: 'f1', name: 'Folder f1', icon: 'lucide:rocket', color: 'teal', appCount: 1 },
    ]);
    expect(ids(top.apps)).toEqual(['a', 'c']);
  });

  it('opens a folder to its apps and subfolders, with the way back', () => {
    const wire = source(
      ['a', 'b', 'c', 'd'],
      [
        folder('top', null, ['a']),
        folder('mid', 'top', []),
        folder('leaf', 'mid', ['b', 'c']),
        folder('other', null, ['d']),
      ],
    );
    const top = launcherLevel(wire, null)!;
    expect(top.folders.map((f) => [f.id, f.appCount])).toEqual([
      ['top', 3],
      ['other', 1],
    ]);
    expect(top.apps).toEqual([]);

    const open = launcherLevel(wire, 'top')!;
    expect(open.folder).toMatchObject({ id: 'top', appCount: 3 });
    expect(open.crumbs).toEqual([]);
    expect(ids(open.folders)).toEqual(['mid']);
    expect(ids(open.apps)).toEqual(['a']);

    const leaf = launcherLevel(wire, 'leaf')!;
    expect(ids(leaf.crumbs)).toEqual(['top', 'mid']);
    expect(leaf.folders).toEqual([]);
    expect(ids(leaf.apps)).toEqual(['b', 'c']);
  });

  it('keeps the brain’s folder order and the list’s app order', () => {
    const wire = source(['a', 'b', 'c'], [folder('z', null, ['c', 'a']), folder('y', null, ['b'])]);
    expect(ids(launcherLevel(wire, null)!.folders)).toEqual(['z', 'y']);
    expect(ids(launcherLevel(wire, 'z')!.apps)).toEqual(['c', 'a']);
  });

  it('drops a folder that leads to no app of the list, at every depth', () => {
    // `gone` is not in the list (a member's home app, say).
    const wire = source(
      ['a'],
      [folder('empty', null, []), folder('inner', 'empty', ['gone']), folder('f', null, ['a'])],
    );
    expect(ids(launcherLevel(wire, null)!.folders)).toEqual(['f']);
    expect(launcherLevel(wire, 'empty')).toBeNull();
    expect(launcherLevel(wire, 'inner')).toBeNull();
  });

  it('never loses an app to a bad shape: unknown parent, a loop, an app named twice', () => {
    const wire = source(
      ['a', 'b', 'c', 'd'],
      [
        folder('orphan', 'gone', ['a']),
        folder('x', 'y', ['b']),
        folder('y', 'x', ['c']),
        folder('twice', null, ['a', 'ghost']),
      ],
    );
    const top = launcherLevel(wire, null)!;
    // Each of them sits at the top level; `a` shows once, in the first
    // folder that names it; an id the list does not hold is ignored.
    expect(top.folders.map((f) => [f.id, f.appCount])).toEqual([
      ['orphan', 1],
      ['x', 1],
      ['y', 1],
    ]);
    expect(ids(top.apps)).toEqual(['d']);
    expect(ids(launcherLevel(wire, 'x')!.apps)).toEqual(['b']);
    expect(launcherLevel(wire, 'twice')).toBeNull();
  });

  it('never loses an app when two folders share an id (review fix 2)', () => {
    // The brain cannot send it. The second `x` used to overwrite the first
    // one's apps with none, and `a` vanished from the launcher.
    const wire = source(
      ['a', 'b', 'c'],
      [folder('x', null, ['a'], { name: 'First' }), folder('x', null, ['b'], { name: 'Second' })],
    );
    const top = launcherLevel(wire, null)!;
    // One tile, the first folder's name, both folders' apps inside.
    expect(top.folders).toEqual([{ id: 'x', name: 'First', icon: null, color: null, appCount: 2 }]);
    expect(ids(top.apps)).toEqual(['c']);
    expect(ids(launcherLevel(wire, 'x')!.apps)).toEqual(['a', 'b']);
    // And when the same app is named by both: once.
    const same = source(['a'], [folder('x', null, ['a']), folder('x', null, ['a'])]);
    expect(ids(launcherLevel(same, 'x')!.apps)).toEqual(['a']);
    expect(launcherLevel(same, null)!.apps).toEqual([]);
    // Every app of the list is somewhere, whatever the shape.
    const everywhere = [...launcherLevel(wire, null)!.apps, ...launcherLevel(wire, 'x')!.apps];
    expect(ids(everywhere).sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores a folder that is not one, and anything that is not a list', () => {
    const junk = [null, 'x', { id: 'f', name: 'F' }, { id: 1, name: 'F', appIds: [] }];
    const top = launcherLevel(source(['a'], junk as never), null)!;
    expect(top.folders).toEqual([]);
    expect(ids(top.apps)).toEqual(['a']);
    expect(ids(launcherLevel(source(['a'], 'nope' as never), null)!.apps)).toEqual(['a']);
  });
});

describe('the launcher’s small parts', () => {
  it('a flat level is the apps and nothing else', () => {
    expect(flatLauncherLevel([card('a')])).toEqual({
      folder: null,
      crumbs: [],
      folders: [],
      apps: [card('a')],
    });
  });

  it('counts in words', () => {
    expect(appCountLabel(1)).toBe('1 app');
    expect(appCountLabel(4)).toBe('4 apps');
  });
});
