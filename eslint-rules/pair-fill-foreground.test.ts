import { RuleTester } from 'eslint';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findMismatches,
  findVariantMismatches,
  rule,
  inkRule,
  VARIANT_FILLS,
  // @ts-expect-error — plain-JS rule module, no types shipped.
} from './pair-fill-foreground.mjs';

/**
 * The rule's whole value is its PRECISION. A pairing rule that fires on the
 * codebase's dominant correct idiom would be turned off within a day, so the
 * "valid" cases below matter at least as much as the invalid ones — most of
 * them are real class strings lifted out of the repo.
 */
describe('findMismatches', () => {
  const flags = (s: string) =>
    findMismatches(s).map((m: { fill: string; ink: string }) => `${m.fill}/${m.ink}`);

  it('accepts the dominant correct idiom: muted base, re-paired on hover', () => {
    // This is what most interactive elements in the app look like. The muted
    // ink applies on the page background; the hover state changes BOTH tokens.
    expect(flags('text-muted-foreground hover:bg-accent hover:text-accent-foreground')).toEqual([]);
  });

  it('accepts a fill paired with its own foreground', () => {
    expect(flags('bg-primary text-primary-foreground')).toEqual([]);
    expect(
      flags('data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'),
    ).toEqual([]);
  });

  it('accepts text-foreground on any fill — the strongest ink is never the bug', () => {
    expect(flags('hover:bg-accent hover:text-foreground')).toEqual([]);
  });

  it('ignores plain surfaces, which legitimately take either ink', () => {
    expect(flags('bg-card text-muted-foreground')).toEqual([]);
    expect(flags('bg-muted text-muted-foreground')).toEqual([]);
  });

  it('ignores tinted fills — a 5% wash is a different surface', () => {
    expect(flags('bg-destructive/5 text-muted-foreground')).toEqual([]);
    expect(flags('hover:bg-accent/60 text-muted-foreground')).toEqual([]);
  });

  it('ignores inks it cannot reason about', () => {
    expect(flags('bg-accent text-white')).toEqual([]);
    expect(flags('bg-accent')).toEqual([]);
  });

  it('catches the shape that actually shipped: muted ink on an accent fill', () => {
    // v0.205.7 (slash-menu, mention-list) and v0.206.1 (CommandItem, ⌘K
    // palette + 4 more). Found by a user, not by CI.
    expect(flags('data-[selected=true]:bg-accent text-muted-foreground')).toEqual([
      'accent/muted-foreground',
    ]);
  });

  it('catches a variant fill whose state sets no ink of its own', () => {
    // The ink falls through to the unprefixed `text-muted-foreground`, so on
    // hover the icon keeps a muted colour while the fill turns to accent.
    // Two real instances of this were in pages-client.tsx.
    expect(flags('rounded text-muted-foreground hover:bg-accent')).toEqual([
      'accent/muted-foreground',
    ]);
  });

  it("catches one fill wearing another fill's foreground", () => {
    expect(flags('bg-primary text-card-foreground')).toEqual(['primary/card-foreground']);
  });

  it('covers the semantic role fills the same as the original four', () => {
    // success/warning/info are first-class fills beside destructive — the
    // pairing discipline arrived with them, not after their first regression.
    expect(flags('bg-success text-muted-foreground')).toEqual(['success/muted-foreground']);
    expect(flags('bg-warning text-accent-foreground')).toEqual(['warning/accent-foreground']);
    expect(flags('bg-info text-info-foreground')).toEqual([]);
    expect(flags('bg-warning/10 text-muted-foreground')).toEqual([]); // tinted wash
  });
});

describe('use-ink-for-text', () => {
  it('rejects the fill used as text, accepts the ink token', () => {
    const ruleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    });
    ruleTester.run('use-ink-for-text', inkRule, {
      valid: [
        // The ink token — contrast-guaranteed on every surface.
        { code: '<p className="text-primary-ink" />' },
        { code: '<p className="text-destructive-ink" />' },
        // The FILL pairing was never the problem and must keep working.
        { code: '<button className="bg-primary text-primary-foreground" />' },
        { code: '<span className="border-destructive bg-destructive/10" />' },
      ],
      invalid: [
        { code: '<p className="text-primary" />', errors: [{ messageId: 'useInk' }] },
        { code: '<p className="hover:text-destructive" />', errors: [{ messageId: 'useInk' }] },
        { code: '<p className="text-destructive/70" />', errors: [{ messageId: 'useInk' }] },
        { code: 'cn("text-primary")', errors: [{ messageId: 'useInk' }] },
        // The semantic roles get the same discipline from day one.
        { code: '<p className="text-success" />', errors: [{ messageId: 'useInk' }] },
        { code: '<p className="text-warning" />', errors: [{ messageId: 'useInk' }] },
        { code: '<p className="text-info" />', errors: [{ messageId: 'useInk' }] },
      ],
    });
  });
});

describe('the ESLint rule wiring', () => {
  it('reports on className JSX attributes and cn() arguments', () => {
    const ruleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    });

    // RuleTester throws on any mismatch between expectation and behaviour.
    ruleTester.run('pair-fill-foreground', rule, {
      valid: [
        { code: '<button className="hover:bg-accent hover:text-accent-foreground" />' },
        { code: 'cn("bg-primary text-primary-foreground")' },
      ],
      invalid: [
        {
          code: '<button className="text-muted-foreground hover:bg-accent" />',
          errors: [{ messageId: 'mismatch' }],
        },
        {
          code: 'cn("bg-primary text-muted-foreground")',
          errors: [{ messageId: 'mismatch' }],
        },
      ],
    });
  });
});

describe('fills painted by a component variant', () => {
  const tester = () =>
    new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    });

  it('catches the shape that shipped: a variant-less <Button> with a muted ink', () => {
    // The live column's collapse control: `<Button>` (so `default`, so
    // `bg-primary`) with the raw button's old `text-muted-foreground`. The
    // caller's ink wins in tailwind-merge, the fill stays. A primary square
    // with a near-invisible icon on it, on the default dark theme.
    tester().run('pair-fill-foreground', rule, {
      valid: [
        // The fix: an unfilled variant for a quiet control.
        { code: '<Button variant="ghost" className="text-muted-foreground" />' },
        { code: '<Button variant="outline" className="text-muted-foreground" />' },
        // A filled button that keeps its own ink.
        { code: '<Button>Save</Button>' },
        { code: '<Button className="w-full" />' },
        // The caller replaced the fill, so the variant ink is not in play.
        { code: '<Button className="bg-transparent text-muted-foreground" />' },
        // Variant and ink branch on the same test: muted only meets outline.
        {
          code: "<Button variant={on ? 'default' : 'outline'} className={on ? undefined : 'text-muted-foreground'} />",
        },
        // A variant the rule cannot resolve statically is left alone.
        { code: '<Button variant={v} className="text-muted-foreground" />' },
        { code: '<Badge variant="outline" className="text-muted-foreground" />' },
        // Children wearing the fill's own ink.
        { code: '<Button><Icon className="text-primary-foreground" /></Button>' },
        { code: '<Button variant="ghost"><Icon className="text-muted-foreground" /></Button>' },
      ],
      invalid: [
        {
          code: '<Button className="size-7 text-muted-foreground hover:bg-foreground/[0.06]" />',
          errors: [{ messageId: 'variantMismatch' }],
        },
        {
          code: '<Button variant="secondary" className="text-muted-foreground" />',
          errors: [{ messageId: 'variantMismatch' }],
        },
        {
          code: '<Badge className="text-muted-foreground" />',
          errors: [{ messageId: 'variantMismatch' }],
        },
        {
          code: "<Button variant={on ? 'default' : 'ghost'} className=\"text-muted-foreground\" />",
          errors: [{ messageId: 'variantMismatch' }],
        },
        {
          code: "cn(buttonVariants({ variant: 'destructive' }), 'text-muted-foreground')",
          errors: [{ messageId: 'variantMismatch' }],
        },
        // The same bug one level down: an icon inside a filled button.
        {
          code: '<Button><Icon className="size-4 text-muted-foreground" /></Button>',
          errors: [{ messageId: 'variantMismatch' }],
        },
      ],
    });
  });

  it('judges the dark-mode resting ink as well', () => {
    // mail-nav had `dark:text-muted-foreground` on a count inside the active
    // (primary-filled) folder link.
    const flags = (fill: string, s: string) =>
      findVariantMismatches(fill, [s]).map((m: { ink: string }) => m.ink);
    expect(flags('primary', 'ml-auto dark:text-muted-foreground')).toEqual(['muted-foreground']);
    expect(flags('primary', 'dark:text-muted-foreground text-primary-foreground')).toEqual([
      'muted-foreground',
    ]);
    expect(flags('primary', 'ml-auto')).toEqual([]);
  });

  it('stays in step with the cva tables it mirrors', () => {
    // If someone adds a filled variant to Button or Badge, the rule must learn
    // it, or that variant can ship the same bug unchecked.
    const filledIn = (path: string) => {
      const src = readFileSync(new URL(path, import.meta.url), 'utf8');
      const out: Record<string, string> = {};
      for (const m of src.matchAll(/^\s*(\w+):\s*\n?\s*'([^']*)'/gm)) {
        const fill = /(?:^|\s)bg-([a-z-]+)(?=\s|$)/.exec(m[2]!)?.[1];
        if (fill && fill !== 'transparent' && m[2]!.includes(`text-${fill}-foreground`))
          out[m[1]!] = fill;
      }
      return out;
    };
    expect(filledIn('../packages/web-ui/src/ui/button.tsx')).toEqual(VARIANT_FILLS.Button);
    expect(filledIn('../packages/web-ui/src/ui/badge.tsx')).toEqual(VARIANT_FILLS.Badge);
  });
});
