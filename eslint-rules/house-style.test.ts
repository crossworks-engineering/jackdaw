import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  findPaletteLiterals,
  noPaletteLiteral,
  noRawFormControl,
  requireThinScrollbar,
  scrollsWithoutThinBar,
  // @ts-expect-error — plain-JS rule module, no types shipped.
} from './house-style.mjs';

/**
 * As with `pair-fill-foreground`, the value of these rules is precision. A
 * house-style rule that fires on correct code gets switched off, so the "valid"
 * cases matter at least as much as the invalid ones, and most are real strings
 * lifted out of the repo.
 */

describe('findPaletteLiterals', () => {
  it('flags the palette literals the audit actually found', () => {
    // The style guide's own "don't" example, from the Pending screen.
    expect(findPaletteLiterals('bg-emerald-600 text-white hover:bg-emerald-700')).toEqual([
      'bg-emerald-600',
      'text-white',
      'bg-emerald-700', // variant stripped: the token is what is wrong, not the state
    ]);
    expect(findPaletteLiterals('bg-amber-100 dark:bg-amber-900/40')).toEqual([
      'bg-amber-100',
      'bg-amber-900/40',
    ]);
    expect(findPaletteLiterals('border-rose-500 ring-sky-300 fill-teal-400')).toHaveLength(3);
  });

  it('leaves semantic tokens alone', () => {
    expect(findPaletteLiterals('bg-card text-muted-foreground border-border')).toEqual([]);
    expect(findPaletteLiterals('bg-success/10 text-success-ink')).toEqual([]);
    expect(findPaletteLiterals('bg-primary text-primary-foreground')).toEqual([]);
    expect(findPaletteLiterals('hover:bg-foreground/[0.06]')).toEqual([]);
  });

  it('does not mistake layout or sizing classes for colours', () => {
    // `text-` also spells sizes, and chart tokens are legitimate.
    expect(findPaletteLiterals('text-sm text-xs font-medium gap-2 size-4')).toEqual([]);
    expect(findPaletteLiterals('bg-chart-1 text-chart-2')).toEqual([]);
    // A component named after a colour is not a colour class.
    expect(findPaletteLiterals('rounded-lg border p-4')).toEqual([]);
  });
});

describe('scrollsWithoutThinBar', () => {
  it('flags a scroll container with no thin bar', () => {
    expect(scrollsWithoutThinBar('flex-1 overflow-y-auto')).toBe(true);
    expect(scrollsWithoutThinBar('overflow-auto rounded-md border')).toBe(true);
    expect(scrollsWithoutThinBar('overflow-x-scroll')).toBe(true);
  });

  it('accepts one that asks for a thin bar, or deliberately hides it', () => {
    expect(scrollsWithoutThinBar('min-h-0 flex-1 overflow-y-auto scrollbar-thin')).toBe(false);
    expect(scrollsWithoutThinBar('overflow-auto scrollbar-none')).toBe(false);
  });

  it('ignores strings that do not scroll', () => {
    expect(scrollsWithoutThinBar('overflow-hidden rounded-lg')).toBe(false);
    expect(scrollsWithoutThinBar('overflow-clip')).toBe(false);
    expect(scrollsWithoutThinBar('flex items-center gap-2')).toBe(false);
  });
});

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('rules over real JSX', () => {
  it('no-palette-literal', () => {
    tester.run('no-palette-literal', noPaletteLiteral, {
      valid: [
        { code: 'const a = <div className="bg-card text-card-foreground" />;' },
        { code: 'const a = <div className={cn("bg-muted", open && "text-foreground")} />;' },
      ],
      invalid: [
        {
          code: 'const a = <div className="bg-emerald-600" />;',
          errors: [{ messageId: 'palette' }],
        },
        {
          // Reached through cn(), and through a conditional branch.
          code: 'const a = <div className={cn("p-2", busy ? "text-red-500" : "text-foreground")} />;',
          errors: [{ messageId: 'palette' }],
        },
      ],
    });
    expect(true).toBe(true);
  });

  it('no-raw-form-control', () => {
    tester.run('no-raw-form-control', noRawFormControl, {
      valid: [
        { code: 'const a = <Button onClick={go}>Save</Button>;' },
        { code: 'const a = <Input value={v} />;' },
        // Plumbing, not a control.
        { code: 'const a = <input type="hidden" name="token" value={t} />;' },
        { code: 'const a = <input type="file" ref={ref} />;' },
      ],
      invalid: [
        { code: 'const a = <button onClick={go}>Save</button>;', errors: [{ messageId: 'raw' }] },
        { code: 'const a = <textarea value={v} />;', errors: [{ messageId: 'raw' }] },
        { code: 'const a = <input type="text" value={v} />;', errors: [{ messageId: 'raw' }] },
      ],
    });
    expect(true).toBe(true);
  });

  it('require-thin-scrollbar', () => {
    tester.run('require-thin-scrollbar', requireThinScrollbar, {
      valid: [
        { code: 'const a = <div className="overflow-y-auto scrollbar-thin" />;' },
        { code: 'const a = <div className="overflow-hidden" />;' },
      ],
      invalid: [
        {
          code: 'const a = <div className="flex-1 overflow-y-auto" />;',
          errors: [{ messageId: 'thin' }],
        },
      ],
    });
    expect(true).toBe(true);
  });
});

describe('require-thin-scrollbar precision', () => {
  it('does not flag a class list it cannot fully see', () => {
    tester.run('require-thin-scrollbar', requireThinScrollbar, {
      valid: [
        // <Scrollable> composes exactly this: the thin/hidden choice arrives as
        // a variable, so the class IS there — just not as a literal.
        { code: 'const a = <div className={cn("overflow-y-auto", scrollbarClass, className)} />;' },
        { code: 'const a = <div className={`overflow-y-auto ${bar}`} />;' },
        // Split across arguments, both visible: still correct.
        { code: 'const a = <div className={cn("overflow-y-auto", "scrollbar-thin")} />;' },
      ],
      invalid: [
        {
          // Fully visible and genuinely missing.
          code: 'const a = <div className={cn("min-h-0 overflow-y-auto", "bg-card")} />;',
          errors: [{ messageId: 'thin' }],
        },
      ],
    });
    expect(true).toBe(true);
  });
});
