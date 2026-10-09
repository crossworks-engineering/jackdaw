/**
 * ESLint rule: a themed fill must carry an ink that is legible on it.
 *
 * THE BUG THIS EXISTS FOR. The style guide has said "pair every fill with its
 * OWN -foreground" for months, and it shipped broken twice anyway — slash-menu
 * + mention-list (v0.205.7), then the shared CommandItem, the ⌘K palette and
 * four more call sites (v0.206.1). Both were `bg-accent` rendering
 * `text-muted-foreground`, which on many themes is near-invisible. A user found
 * it, not CI. Prose rules only work while the reader is diligent.
 *
 * WHY IT IS NARROW, ON PURPOSE. The naive check — "this className mentions
 * bg-accent and text-muted-foreground" — is almost entirely false positives.
 * The dominant idiom in this codebase is
 *
 *     text-muted-foreground hover:bg-accent hover:text-accent-foreground
 *
 * which is CORRECT: the muted ink applies to the resting state on the page
 * background, and the hover state re-pairs both tokens together. So the rule
 * resolves ink per VARIANT STATE: a `hover:bg-accent` is judged against
 * `hover:text-*` if present, and only falls through to the unprefixed ink when
 * that state sets no ink of its own.
 *
 * Three deliberate limits, per the plan's "accept false negatives" instruction:
 *   1. Only BRANDED fills are checked. `bg-card` / `bg-muted` / `bg-background`
 *      legitimately take both `text-foreground` and `text-muted-foreground`.
 *   2. Fills with an opacity modifier (`bg-destructive/5`) are skipped — a 5%
 *      tint is a different surface and muted ink on it is normal.
 *   3. Only THEMED `-foreground` inks are flagged. `text-foreground` is the
 *      strongest ink available and never the bug; `text-white` and friends are
 *      deliberate opt-outs this rule cannot reason about.
 */

/** Fills that carry their own `-foreground` and must be paired with it. */
const BRANDED_FILLS = [
  'accent',
  'primary',
  'secondary',
  'destructive',
  'success',
  'warning',
  'info',
  'sidebar-accent',
  'sidebar-primary',
];

/** Inks that are themed foregrounds — the ones a mismatch can be proven about. */
const THEMED_INKS = [
  'muted-foreground',
  'card-foreground',
  'popover-foreground',
  'accent-foreground',
  'primary-foreground',
  'secondary-foreground',
  'destructive-foreground',
  'success-foreground',
  'warning-foreground',
  'info-foreground',
  'sidebar-foreground',
  'sidebar-accent-foreground',
  'sidebar-primary-foreground',
];

const splitVariant = (token) => {
  const at = token.lastIndexOf(':');
  return at < 0
    ? { variant: '', base: token }
    : { variant: token.slice(0, at), base: token.slice(at + 1) };
};

/**
 * @param {string} classes a whitespace-separated Tailwind class string
 * @returns {Array<{ fill: string, ink: string, variant: string }>} mismatches
 */
export function findMismatches(classes) {
  const tokens = classes.split(/\s+/).filter(Boolean).map(splitVariant);

  // ink applying in each variant state, plus the unprefixed fallthrough
  const inkByVariant = new Map();
  for (const { variant, base } of tokens) {
    if (!base.startsWith('text-')) continue;
    const ink = base.slice(5).split('/')[0];
    if (THEMED_INKS.includes(ink) || ink === 'foreground') inkByVariant.set(variant, ink);
  }

  const out = [];
  for (const { variant, base } of tokens) {
    if (!base.startsWith('bg-')) continue;
    const raw = base.slice(3);
    if (raw.includes('/')) continue; // tinted fill — different surface
    if (!BRANDED_FILLS.includes(raw)) continue;

    const ink = inkByVariant.has(variant) ? inkByVariant.get(variant) : inkByVariant.get('');
    if (!ink) continue; // no themed ink in play — nothing provable
    if (ink === 'foreground') continue; // strongest ink, never the bug
    if (ink === `${raw}-foreground`) continue; // correctly paired
    if (!THEMED_INKS.includes(ink)) continue;

    out.push({ fill: raw, ink, variant });
  }
  return out;
}

/** Pull every static class-string out of className={...} / cn(...) arguments. */
function stringsFrom(node) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.type === 'Literal' && typeof n.value === 'string') out.push({ node: n, value: n.value });
    else if (n.type === 'TemplateLiteral')
      for (const q of n.quasis) out.push({ node: n, value: q.value.raw });
    else if (n.type === 'JSXExpressionContainer') walk(n.expression);
    else if (n.type === 'CallExpression') n.arguments.forEach(walk);
    else if (n.type === 'ConditionalExpression') [n.consequent, n.alternate].forEach(walk);
    else if (n.type === 'LogicalExpression') [n.left, n.right].forEach(walk);
    else if (n.type === 'ArrayExpression') n.elements.forEach(walk);
    else if (n.type === 'ObjectExpression') n.properties.forEach((p) => walk(p.key));
  };
  walk(node);
  return out;
}

/**
 * Fills a shared component paints from its `variant`, NOT from `className`.
 *
 * THE BUG THIS EXISTS FOR. The live column's collapse control went from a raw
 * `<button>` to `<Button>` with its old `text-muted-foreground` className and no
 * `variant`. No variant means `default`, which is `bg-primary
 * text-primary-foreground`; tailwind-merge lets the caller's ink win and keeps
 * the variant's fill. Result: a bright primary square with a muted icon on it,
 * 1.1:1 to 2.3:1 on most themes. The className check above never saw a fill,
 * because the fill lives inside the component.
 *
 * Keep this in step with the cva tables in packages/web-ui/src/ui/{button,badge}.tsx
 * (the test parses both files and fails if they drift). Only variants with a
 * solid branded fill are listed; `ghost` / `outline` / `link` paint none.
 */
export const VARIANT_FILLS = {
  Button: {
    default: 'primary',
    secondary: 'secondary',
    destructive: 'destructive',
    approve: 'primary',
    deny: 'destructive',
  },
  Badge: { default: 'primary', secondary: 'secondary', destructive: 'destructive' },
};
const VARIANT_FNS = { buttonVariants: 'Button', badgeVariants: 'Badge' };

/** Every static variant name a prop can take. `null` = not knowable, skip. */
function variantsFrom(node) {
  if (!node) return ['default'];
  const out = [];
  let unknown = false;
  const walk = (n) => {
    if (!n) return;
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
    else if (n.type === 'JSXExpressionContainer') walk(n.expression);
    else if (n.type === 'ConditionalExpression') [n.consequent, n.alternate].forEach(walk);
    else if (n.type === 'Identifier' && n.name === 'undefined') out.push('default');
    else unknown = true;
  };
  walk(node);
  return unknown ? null : out;
}

/**
 * Mismatches for a component whose variant paints `fill`, given every static
 * class string the caller adds. A caller that sets its own unprefixed `bg-*`
 * has replaced the fill (tailwind-merge), so there is nothing to prove.
 */
export function findVariantMismatches(fill, classStrings) {
  const classes = classStrings.join(' ');
  const tokens = classes.split(/\s+/).filter(Boolean).map(splitVariant);
  if (tokens.some((t) => t.variant === '' && t.base.startsWith('bg-'))) return [];
  // `dark:text-*` is the resting ink in dark mode, so judge that mode too.
  const darkResting = [
    ...tokens.filter((t) => t.variant === ''),
    ...tokens.filter((t) => t.variant === 'dark'),
  ]
    .map((t) => t.base)
    .join(' ');
  const seen = new Set();
  return [classes, darkResting]
    .flatMap((c) => findMismatches(`bg-${fill} text-${fill}-foreground ${c}`))
    .filter((m) => m.variant === '' && m.fill === fill)
    .filter((m) => !seen.has(m.ink) && seen.add(m.ink));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'A themed fill must be paired with an ink that is legible on it.' },
    schema: [],
    messages: {
      mismatch:
        '`bg-{{fill}}` is paired with `text-{{ink}}`{{where}} — use `text-{{fill}}-foreground` (or `text-foreground`). ' +
        'A fill and a foreign foreground are not guaranteed any contrast; this exact shape shipped invisible text twice.',
      variantMismatch:
        '<{{component}}> paints `bg-{{fill}}` from its variant, but this className sets `text-{{ink}}`, which wins. ' +
        'Pass `variant="ghost"` (or another unfilled variant) for a quiet control, or drop the ink so the ' +
        'variant keeps `text-{{fill}}-foreground`.',
    },
  },
  create(context) {
    const check = (node) => {
      for (const { node: strNode, value } of stringsFrom(node)) {
        for (const m of findMismatches(value)) {
          context.report({
            node: strNode,
            messageId: 'mismatch',
            data: {
              fill: m.fill,
              ink: m.ink,
              where: m.variant ? ` in the \`${m.variant}:\` state` : '',
            },
          });
        }
      }
    };
    const reportVariant = (node, component, variants, classNode) => {
      const strings = stringsFrom(classNode).map((s) => s.value);
      const fills = new Set(variants.map((v) => VARIANT_FILLS[component][v]).filter(Boolean));
      for (const fill of fills) {
        for (const m of findVariantMismatches(fill, strings)) {
          context.report({
            node,
            messageId: 'variantMismatch',
            data: { component, fill: m.fill, ink: m.ink },
          });
        }
      }
    };
    return {
      JSXAttribute(node) {
        if (node.name?.name === 'className') check(node.value);
      },
      JSXOpeningElement(node) {
        const component = node.name?.name;
        if (!VARIANT_FILLS[component]) return;
        const attr = (name) =>
          node.attributes.find((a) => a.type === 'JSXAttribute' && a.name?.name === name);
        const cls = attr('className');
        if (!cls) return;
        const v = attr('variant');
        // `variant={on ? 'default' : 'outline'} className={on ? undefined : 'text-muted-foreground'}`
        // is correct: the muted ink only ever meets the unfilled variant. When
        // both props branch on the same test, judge each branch on its own.
        const vx = v?.value?.type === 'JSXExpressionContainer' ? v.value.expression : null;
        const cx = cls.value?.type === 'JSXExpressionContainer' ? cls.value.expression : null;
        const src = (n) => context.sourceCode.getText(n);
        if (
          vx?.type === 'ConditionalExpression' &&
          cx?.type === 'ConditionalExpression' &&
          src(vx.test) === src(cx.test)
        ) {
          for (const branch of ['consequent', 'alternate']) {
            const variants = variantsFrom(vx[branch]);
            if (variants) reportVariant(cls, component, variants, cx[branch]);
          }
          return;
        }
        const variants = v ? variantsFrom(v.value) : ['default'];
        if (variants) reportVariant(cls, component, variants, cls.value);
      },
      // An icon or label INSIDE a filled <Button> sits on the same fill, so a
      // muted ink there is the same bug one level down. Only judged when every
      // variant the prop can take is filled and the caller kept the fill.
      JSXElement(node) {
        const open = node.openingElement;
        const component = open.name?.name;
        if (!VARIANT_FILLS[component]) return;
        const attr = (name) =>
          open.attributes.find((a) => a.type === 'JSXAttribute' && a.name?.name === name);
        const v = attr('variant');
        const variants = v ? variantsFrom(v.value) : ['default'];
        if (!variants) return;
        const fills = variants.map((x) => VARIANT_FILLS[component][x]);
        if (fills.some((f) => !f) || new Set(fills).size !== 1) return;
        const fill = fills[0];
        const own = attr('className');
        const ownStrings = own ? stringsFrom(own.value).map((x) => x.value) : [];
        if (
          ownStrings
            .join(' ')
            .split(/\s+/)
            .some((t) => t.startsWith('bg-'))
        )
          return;
        const walkChildren = (children) => {
          for (const c of children) {
            const el =
              c.type === 'JSXElement'
                ? c
                : c.type === 'JSXExpressionContainer' && c.expression?.type === 'LogicalExpression'
                  ? c.expression.right
                  : null;
            if (el?.type !== 'JSXElement') continue;
            const cls = el.openingElement.attributes.find(
              (a) => a.type === 'JSXAttribute' && a.name?.name === 'className',
            );
            if (cls) {
              const strings = stringsFrom(cls.value).map((x) => x.value);
              for (const m of findVariantMismatches(fill, strings)) {
                context.report({
                  node: cls,
                  messageId: 'variantMismatch',
                  data: { component, fill: m.fill, ink: m.ink },
                });
              }
            }
            walkChildren(el.children);
          }
        };
        walkChildren(node.children);
      },
      CallExpression(node) {
        if (node.callee?.name !== 'cn' && node.callee?.name !== 'clsx') return;
        check(node);
        // cn(buttonVariants({ variant }), '...caller classes')
        for (const arg of node.arguments) {
          const component = arg.type === 'CallExpression' && VARIANT_FNS[arg.callee?.name];
          if (!component) continue;
          const opts = arg.arguments[0];
          const prop =
            opts?.type === 'ObjectExpression' &&
            opts.properties.find((p) => p.key?.name === 'variant');
          const variants = prop ? variantsFrom(prop.value) : ['default'];
          if (!variants) continue;
          const rest = {
            type: 'ArrayExpression',
            elements: node.arguments.filter((a) => a !== arg),
          };
          reportVariant(node, component, variants, rest);
        }
      },
    };
  },
};

/** Fills whose text form is a separate token. */
const INK_FILLS = ['primary', 'destructive', 'success', 'warning', 'info'];

export const inkRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Use the -ink token for text, not the fill.' },
    fixable: 'code',
    schema: [],
    messages: {
      useInk:
        '`text-{{fill}}` is the FILL colour used as text. Use `text-{{fill}}-ink`, which is ' +
        'contrast-guaranteed on every surface in every theme. The fill is tuned to sit behind ' +
        '`text-{{fill}}-foreground` and is frequently illegible as ink — one preset rendered it ' +
        'at 1.05:1.',
    },
  },
  create(context) {
    const check = (node) => {
      for (const { node: strNode, value } of stringsFrom(node)) {
        for (const tok of value.split(/\s+/).filter(Boolean)) {
          const { base } = splitVariant(tok);
          const m = /^text-([a-z-]+?)(\/\d+)?$/.exec(base);
          if (!m || !INK_FILLS.includes(m[1])) continue;
          context.report({ node: strNode, messageId: 'useInk', data: { fill: m[1] } });
        }
      }
    };
    return {
      JSXAttribute(node) {
        if (node.name?.name === 'className') check(node.value);
      },
      CallExpression(node) {
        if (node.callee?.name === 'cn' || node.callee?.name === 'clsx') check(node);
      },
    };
  },
};

export default { rules: { 'pair-fill-foreground': rule, 'use-ink-for-text': inkRule } };
