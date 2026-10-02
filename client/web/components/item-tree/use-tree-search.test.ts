import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The tree's search lives in `?q=`. The node runner has no DOM, so the hook
 * runs here on a small stand-in for React (state, refs and effects, enough
 * for `useUrlSearchBox`) and a stand-in for the browser's location and
 * history. As in Next, a `replaceState` moves `useSearchParams`, which
 * renders the hook again.
 */
const h = vi.hoisted(() => {
  type EffectSlot = { deps?: unknown[]; cleanup?: void | (() => void) };
  const s = {
    slots: [] as unknown[],
    i: 0,
    effects: [] as Array<() => void>,
    dirty: false,
    flushing: false,
    hook: null as null | (() => unknown),
    out: undefined as unknown,
    href: 'http://app.test/tasks',
    replaced: [] as string[],
    pushed: 0,
  };
  const render = () => {
    if (s.flushing) {
      s.dirty = true;
      return;
    }
    s.flushing = true;
    s.dirty = true;
    while (s.dirty) {
      s.dirty = false;
      s.i = 0;
      s.effects = [];
      s.out = s.hook!();
      const run = s.effects;
      s.effects = [];
      for (const e of run) e();
    }
    s.flushing = false;
  };
  const react = {
    useState<T>(init: T | (() => T)) {
      const k = s.i++;
      if (!(k in s.slots)) s.slots[k] = typeof init === 'function' ? (init as () => T)() : init;
      const set = (v: T | ((p: T) => T)) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(s.slots[k] as T) : v;
        if (Object.is(next, s.slots[k])) return;
        s.slots[k] = next;
        render();
      };
      return [s.slots[k] as T, set] as const;
    },
    useRef<T>(init: T) {
      const k = s.i++;
      if (!(k in s.slots)) s.slots[k] = { current: init };
      return s.slots[k] as { current: T };
    },
    useEffect(fn: () => void | (() => void), deps?: unknown[]) {
      const k = s.i++;
      const prev = s.slots[k] as EffectSlot | undefined;
      if (prev?.deps && deps && deps.every((d, j) => Object.is(d, prev.deps![j]))) return;
      s.effects.push(() => {
        if (typeof prev?.cleanup === 'function') prev.cleanup();
        s.slots[k] = { deps, cleanup: fn() };
      });
    },
  };
  const window = {
    get location() {
      return { href: s.href };
    },
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, url: string) {
        s.href = url;
        s.replaced.push(url);
        render();
      },
      pushState() {
        s.pushed++;
      },
    },
  };
  const mount = (hook: () => unknown) => {
    s.slots = [];
    s.hook = hook;
    render();
  };
  return { s, react, window, render, mount };
});

vi.mock('react', () => h.react);
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URL(h.s.href).searchParams,
}));

const { useTreeSearch, treeSearchOf } = await import('./use-tree-search');
const { SEARCH_DEBOUNCE_MS } = await import('@/lib/url-search-box');

type Box = [string, (value: string) => void];
const box = () => h.s.out as Box;
const typeIn = (value: string) => box()[1](value);
const params = () => new URL(h.s.href).searchParams;
/** The URL moving some other way: a link, Back, or another view's search. */
const moveUrlTo = (href: string) => {
  h.s.href = href;
  h.render();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', h.window);
  h.s.replaced = [];
  h.s.pushed = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useTreeSearch', () => {
  it('opens with the text of ?q=, and with none when the URL has none', () => {
    h.s.href = 'http://app.test/tasks?q=pump';
    h.mount(useTreeSearch);
    expect(box()[0]).toBe('pump');

    h.s.href = 'http://app.test/tasks';
    h.mount(useTreeSearch);
    expect(box()[0]).toBe('');
    // Opening writes nothing.
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2);
    expect(h.s.replaced).toEqual([]);
  });

  it('writes the text back to ?q= after a pause, with replaceState and once', () => {
    h.s.href = 'http://app.test/tasks';
    h.mount(useTreeSearch);
    typeIn('p');
    typeIn('pu');
    typeIn('pump');
    // The tree filters at once; the URL waits.
    expect(box()[0]).toBe('pump');
    expect(params().get('q')).toBeNull();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(params().get('q')).toBe('pump');
    expect(h.s.replaced).toHaveLength(1);
    expect(h.s.pushed).toBe(0);
    // The URL's echo of its own write leaves the box as typed.
    expect(box()[0]).toBe('pump');
  });

  it('keeps every other param of the screen', () => {
    h.s.href = 'http://app.test/tasks?view=list&status=active&selected=t1&folder=f9';
    h.mount(useTreeSearch);
    typeIn('pump');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    const p = params();
    expect(p.get('q')).toBe('pump');
    expect(p.get('view')).toBe('list');
    expect(p.get('status')).toBe('active');
    expect(p.get('selected')).toBe('t1');
    expect(p.get('folder')).toBe('f9');
  });

  it('clearing the search removes q from the URL, and nothing else', () => {
    h.s.href = 'http://app.test/notes?q=pump&selected=n1';
    h.mount(useTreeSearch);
    typeIn('');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(h.s.href).toBe('http://app.test/notes?selected=n1');
    expect(box()[0]).toBe('');
    // Spaces alone are no search either.
    typeIn('   ');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(params().has('q')).toBe(false);
  });

  it('follows the URL when another view or Back changes q', () => {
    h.s.href = 'http://app.test/tasks?q=pump';
    h.mount(useTreeSearch);
    // The Board searched "valve", then the tree came back.
    moveUrlTo('http://app.test/tasks?q=valve&view=board');
    expect(box()[0]).toBe('valve');
    // Back to the screen with no search.
    moveUrlTo('http://app.test/tasks');
    expect(box()[0]).toBe('');
    // Following the URL writes nothing back.
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2);
    expect(h.s.replaced).toEqual([]);
  });

  it('reads q trimmed', () => {
    expect(treeSearchOf(new URLSearchParams('q=%20pump%20'))).toBe('pump');
    expect(treeSearchOf(new URLSearchParams('view=board'))).toBe('');
  });
});

/**
 * Every screen that renders the shared tree takes its search from the hook,
 * so none keeps the text in local state that a link, a reload or Back loses.
 */
describe('the screens that render ItemTree', () => {
  const web = fileURLToPath(new URL('../..', import.meta.url));
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (name === 'node_modules' || name.startsWith('.')) return [];
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
    });
  const screens = [...walk(join(web, 'app')), ...walk(join(web, 'components'))]
    .map((p) => ({ p, src: readFileSync(p, 'utf8') }))
    .filter(({ src }) => /<ItemTree\b/.test(src));

  it('finds the screens', () => {
    expect(screens.length).toBeGreaterThanOrEqual(14);
  });

  it.each(screens.map(({ p, src }) => [p.slice(web.length), src]))(
    '%s takes its tree search from the URL',
    (_name, src) => {
      expect(src).not.toMatch(/\[treeQuery, setTreeQuery\] = useState/);
      expect(src).toMatch(/useTreeSearch\(\)|useFileSearch\(\)/);
    },
  );

  it('the Files search is the same hook', () => {
    const files = readFileSync(join(web, 'app/(app)/files/use-file-search.ts'), 'utf8');
    expect(files).toContain('const [query, setQuery] = useTreeSearch();');
  });
});
