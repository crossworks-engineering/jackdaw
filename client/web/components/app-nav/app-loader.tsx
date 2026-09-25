'use client';

import { ThinkingOrb } from 'thinking-orbs';
import type { AppTint } from '@mantle/web-ui/types/app-nav';
import { AppTile } from './app-tile';

/**
 * What covers a mini app until it is ready to be seen. AppSandbox keeps it up
 * while the frame mounts and the app's first data loads, then cross-fades to
 * the app (the reveal rules live in share-ui's app-reveal.ts).
 *
 * The 64px "shaping" orb (a dotted outline morphing circle → triangle →
 * square: an app assembling itself), with the app's own tile and name under
 * it when the surface knows them. The orb follows light/dark on its own.
 */
export function AppLoader({
  title,
  icon,
  color,
}: {
  title?: string | null;
  icon?: string | null;
  color?: AppTint | null;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 text-center animate-in fade-in duration-500"
    >
      <ThinkingOrb state="shaping" size={64} aria-hidden />
      {title ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <AppTile icon={icon} color={color} size="sm" />
          <span className="max-w-64 truncate">Opening {title}</span>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Opening app</span>
      )}
    </div>
  );
}

/**
 * The `loader` prop for AppSandbox.
 *
 * Contract-next: share-ui's next release adds `loader` to AppSandbox. The
 * pinned version doesn't declare it (and simply ignores the prop at runtime),
 * hence the cast. After the pin bump, pass `loader={<AppLoader … />}` directly
 * and delete this helper.
 */
export function appLoaderProp(look: Parameters<typeof AppLoader>[0] = {}): object {
  return { loader: <AppLoader {...look} /> };
}
