/**
 * ESLint rules for the three house rules that decayed while they were prose.
 *
 * THE PATTERN THIS EXISTS FOR. The 2026-09-07 frontend audit found a clean
 * split: every rule backed by a lint gate was essentially perfect — zero bare
 * `text-primary`, zero mixed fill/foreground pairs, zero `window.confirm`,
 * zero dynamically built class names — while every prose-only rule had decayed,
 * badly. 359 named-palette literals across 60 files, 166 raw `<button>`s of
 * which six carried any focus style, and 60 scroll containers without
 * `scrollbar-thin`, seven of them inside the kit where they propagate to every
 * menu and table in the app. The style guide predicted this about itself:
 * "prose rules only work while the reader is diligent."
 *
 * These three are deliberately mechanical. Each has a pure core exported for
 * tests, and each accepts false negatives rather than risk a false positive on
 * the codebase's dominant correct idioms — the same bargain
 * `pair-fill-foreground` made, for the same reason: a rule that cries wolf is
 * turned off within a day.
 */

const splitVariant = (token) => {
  const at = token.lastIndexOf(':');
  return at < 0
    ? { variant: '', base: token }
    : { variant: token.slice(0, at), base: token.slice(at + 1) };
};

/** Pull every static string out of a className attribute or a cn()/clsx() call.
 *  Template literals contribute their literal chunks; an interpolation is
 *  simply not visible to any of this, which is fine — Tailwind cannot see it
 *  either, and a separate rule already bans building class names dynamically. */
function stringsFrom(node, out = []) {
  if (!node) return out;
  const n = node.type === 'JSXExpressionContainer' ? node.expression : node;
  if (!n) return out;
  if (n.type === 'Literal' && typeof n.value === 'string') out.push({ node: n, value: n.value });
  else if (n.type === 'TemplateLiteral')
    for (const q of n.quasis) out.push({ node: q, value: q.value.cooked ?? '' });
  // Deliberately NOT descending into a CallExpression: `className={cn(...)}`
  // matches both visitors below, and descending here as well would report every
  // string inside it twice.
  else if (n.type === 'ConditionalExpression') {
    stringsFrom(n.consequent, out);
    stringsFrom(n.alternate, out);
  } else if (n.type === 'LogicalExpression') {
    stringsFrom(n.left, out);
    stringsFrom(n.right, out);
  } else if (n.type === 'ArrayExpression') for (const e of n.elements) stringsFrom(e, out);
  return out;
}

const classVisitors = (check) => ({
  JSXAttribute(node) {
    if (node.name?.name === 'className') check(node.value);
  },
  CallExpression(node) {
    if (node.callee?.name !== 'cn' && node.callee?.name !== 'clsx') return;
    for (const arg of node.arguments) check(arg);
  },
});

// ── 1. No named-palette colours ─────────────────────────────────────────────

/** Tailwind's stock palette. The app ships ~40 generated themes, so a literal
 *  from this list is correct on none of them and merely happens to look right
 *  on whichever one the author had open. */
const PALETTE = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

/** Utilities that take a colour. Deliberately not exhaustive: these are the
 *  ones the audit actually found carrying palette literals. */
const COLOR_PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'from',
  'via',
  'to',
  'fill',
  'stroke',
  'shadow',
  'outline',
  'decoration',
  'divide',
  'accent',
  'caret',
];

const PALETTE_RE = new RegExp(
  `^(${COLOR_PREFIXES.join('|')})-(${PALETTE.join('|')})-\\d{2,3}(\\/\\d+)?$`,
);

/** `bg-white` / `text-black` are the same mistake spelled shorter. */
const MONO_RE = new RegExp(`^(${COLOR_PREFIXES.join('|')})-(white|black)(\\/\\d+)?$`);

/**
 * @param {string} classes a whitespace-separated Tailwind class string
 * @returns {string[]} the offending base tokens, variant stripped
 */
export function findPaletteLiterals(classes) {
  const out = [];
  for (const tok of classes.split(/\s+/).filter(Boolean)) {
    const { base } = splitVariant(tok);
    if (PALETTE_RE.test(base) || MONO_RE.test(base)) out.push(base);
  }
  return out;
}

export const noPaletteLiteral = {
  meta: {
    type: 'problem',
    docs: { description: 'use theme tokens, never Tailwind palette literals' },
    schema: [],
    messages: {
      palette:
        '"{{token}}" is a Tailwind palette literal — it is correct on none of the ~40 themes. Use a semantic token (bg-card, text-muted-foreground, bg-success/10, text-warning-ink …).',
    },
  },
  create(context) {
    const check = (node) => {
      for (const { node: strNode, value } of stringsFrom(node)) {
        for (const token of findPaletteLiterals(value)) {
          context.report({ node: strNode, messageId: 'palette', data: { token } });
        }
      }
    };
    return classVisitors(check);
  },
};

// ── 2. No raw form controls ─────────────────────────────────────────────────

/** The kit has a primitive for each of these. The cost of the raw element is
 *  not style, it is behaviour: of 166 raw `<button>`s the audit counted, six
 *  had any focus style at all, so keyboard users lose the focus ring the kit
 *  gives for free. */
const RAW_CONTROLS = ['button', 'input', 'select', 'textarea'];

const KIT_REPLACEMENT = {
  button: 'Button',
  input: 'Input',
  select: 'Select',
  textarea: 'Textarea',
};

export const noRawFormControl = {
  meta: {
    type: 'problem',
    docs: { description: 'compose form controls from the kit, not raw elements' },
    schema: [],
    messages: {
      raw: 'Raw <{{tag}}> — use <{{kit}}> from @mantle/web-ui/ui/{{tag}}. The kit carries the focus ring, sizing and theming; a raw element carries none of them. If no primitive fits, add an eslint-disable with the reason.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const tag = node.name?.type === 'JSXIdentifier' ? node.name.name : null;
        if (!tag || !RAW_CONTROLS.includes(tag)) return;
        // A hidden input is plumbing, not a control: file pickers, form posts
        // and the SSO handoff all use one and none of them are visible.
        if (tag === 'input') {
          const type = node.attributes.find(
            (a) => a.type === 'JSXAttribute' && a.name?.name === 'type',
          );
          const literal = type?.value?.type === 'Literal' ? type.value.value : null;
          if (literal === 'hidden' || literal === 'file') return;
        }
        context.report({ node, messageId: 'raw', data: { tag, kit: KIT_REPLACEMENT[tag] } });
      },
    };
  },
};

// ── 3. Thin scrollbars, no exceptions ───────────────────────────────────────

/** The utilities that make an element scroll. `overflow-hidden` and
 *  `overflow-clip` do not, so they are not here. */
const SCROLLS_RE = /^overflow(-[xy])?-(auto|scroll)$/;

/**
 * @param {string} classes a whitespace-separated Tailwind class string
 * @returns {boolean} true when the string scrolls without asking for a thin bar
 */
export function scrollsWithoutThinBar(classes) {
  const tokens = classes.split(/\s+/).filter(Boolean).map(splitVariant);
  const scrolls = tokens.some((t) => SCROLLS_RE.test(t.base));
  if (!scrolls) return false;
  return !tokens.some((t) => t.base === 'scrollbar-thin' || t.base === 'scrollbar-none');
}

/** Every static string under a className / cn() call, descending through the
 *  call this time — this rule judges the WHOLE class list, not each string. */
function allStrings(node, out = []) {
  if (!node) return out;
  const n = node.type === 'JSXExpressionContainer' ? node.expression : node;
  if (!n) return out;
  if (n.type === 'CallExpression') {
    for (const a of n.arguments) allStrings(a, out);
    return out;
  }
  return stringsFrom(n, out);
}

/**
 * True when part of the class list is a value this rule cannot read — an
 * identifier, a member expression, a nested call.
 *
 * This is what keeps `<Scrollable>` from being flagged: it composes
 * `cn('overflow-y-auto', scrollbarClass, className)`, where `scrollbarClass`
 * IS the thin/hidden choice. The class is there, just not as a literal. Rather
 * than making that one component carry a disable comment, the rule declines to
 * claim a class is missing when it cannot see the whole list — the same
 * false-negatives-over-false-positives bargain the rest of this file makes.
 */
function hasOpaqueParts(node) {
  if (!node) return false;
  const n = node.type === 'JSXExpressionContainer' ? node.expression : node;
  if (!n) return false;
  switch (n.type) {
    case 'Literal':
      return false;
    case 'TemplateLiteral':
      return n.expressions.length > 0;
    case 'CallExpression':
      return n.arguments.some(hasOpaqueParts);
    case 'ConditionalExpression':
      return hasOpaqueParts(n.consequent) || hasOpaqueParts(n.alternate);
    case 'LogicalExpression':
      return hasOpaqueParts(n.left) || hasOpaqueParts(n.right);
    case 'ArrayExpression':
      return n.elements.some(hasOpaqueParts);
    case 'ObjectExpression':
      return true;
    default:
      return true;
  }
}

export const requireThinScrollbar = {
  meta: {
    type: 'problem',
    docs: { description: 'every scroll container carries scrollbar-thin' },
    schema: [],
    messages: {
      thin: 'This scrolls but does not ask for a thin scrollbar. Add `scrollbar-thin` (or `scrollbar-none` where the bar is deliberately hidden) — the style guide says no exceptions, and the fat default reads as a different app.',
    },
  },
  create(context) {
    // Judged per CONTAINER, because the scroll utility and the scrollbar class
    // are routinely in different arguments of the same cn().
    const check = (container) => {
      if (hasOpaqueParts(container)) return;
      const strings = allStrings(container);
      const joined = strings.map((s) => s.value).join(' ');
      if (!scrollsWithoutThinBar(joined)) return;
      const anchor = strings.find(({ value }) => scrollsWithoutThinBar(value)) ?? strings[0];
      if (anchor) context.report({ node: anchor.node, messageId: 'thin' });
    };
    return {
      JSXAttribute(node) {
        if (node.name?.name === 'className') check(node.value);
      },
      CallExpression(node) {
        if (node.callee?.name !== 'cn' && node.callee?.name !== 'clsx') return;
        // A cn() inside a className was already judged by the attribute above.
        if (node.parent?.type === 'JSXExpressionContainer') return;
        check(node);
      },
    };
  },
};

export default {
  rules: {
    'no-palette-literal': noPaletteLiteral,
    'no-raw-form-control': noRawFormControl,
    'require-thin-scrollbar': requireThinScrollbar,
  },
};
