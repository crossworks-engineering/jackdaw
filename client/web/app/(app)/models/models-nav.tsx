'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@mantle/web-ui/lib/utils';

const LINKS = [
  { href: '/models', label: 'Explorer' },
  { href: '/models/pools', label: 'Pools' },
  { href: '/models/combos', label: 'Combos' },
] as const;

/**
 * The three model screens are one workflow (browse → curate → apply), so each
 * list header carries the same segmented switcher. Styled like `TabsList` —
 * the `bg-muted` pill is what makes the navigation findable — but these are
 * real links between routes, not a Radix tab state.
 */
export function ModelsNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Model screens"
      className={cn(
        'flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
    >
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
              active ? 'bg-background text-foreground shadow' : 'hover:text-foreground',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
