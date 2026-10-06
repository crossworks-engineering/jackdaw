import type { ComponentProps } from 'react';
import { AlertTriangle, Info, Lightbulb, OctagonAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { ASIDE_DEFAULT_TITLES, isAsideType, type AsideType } from '@/lib/doc-asides';

// Literal class strings (no dynamic construction) so Tailwind v4 picks them up.
// Same tints as the Pages callout (page-editor/callout-view.tsx).
const ASIDE_STYLES: Record<AsideType, { icon: LucideIcon; wrap: string; tint: string }> = {
  note: { icon: Info, wrap: 'border-info/30 bg-info/10', tint: 'text-info-ink' },
  tip: { icon: Lightbulb, wrap: 'border-success/30 bg-success/10', tint: 'text-success-ink' },
  caution: {
    icon: AlertTriangle,
    wrap: 'border-warning/30 bg-warning/10',
    tint: 'text-warning-ink',
  },
  danger: {
    icon: OctagonAlert,
    wrap: 'border-destructive/30 bg-destructive/10',
    tint: 'text-destructive-ink',
  },
};

/**
 * react-markdown renderer for the `aside` element that `remarkAsides`
 * (lib/doc-asides.ts) emits for a Starlight `:::note[Title]` block: a tinted
 * box with an icon and a short title, the body as ordinary prose.
 */
export function DocAside({
  children,
  node: _node,
  ...rest
}: ComponentProps<'aside'> & { node?: unknown }) {
  const attrs = rest as Record<string, unknown>;
  const kind = attrs['data-aside-type'];
  if (!isAsideType(kind)) return <aside>{children}</aside>;
  const title =
    typeof attrs['data-aside-title'] === 'string' && attrs['data-aside-title']
      ? attrs['data-aside-title']
      : ASIDE_DEFAULT_TITLES[kind];
  const style = ASIDE_STYLES[kind];
  const Icon = style.icon;
  return (
    <aside
      aria-label={title}
      data-aside-type={kind}
      className={cn('my-5 rounded-lg border px-4 py-3', style.wrap)}
    >
      <p
        aria-hidden
        className={cn('not-prose mb-1.5 flex items-center gap-2 text-sm font-semibold', style.tint)}
      >
        <Icon className="size-4 shrink-0" />
        {title}
      </p>
      <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
    </aside>
  );
}
