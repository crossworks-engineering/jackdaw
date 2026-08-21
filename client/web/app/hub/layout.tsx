import { ToastProvider } from '@mantle/web-ui/ui/toast';
/**
 * /hub — the Team Hub's new home. The curated hub (designated hub APP when
 * one is set, else the built-in briefing hub) moved here when /team became
 * the read-only member workspace. Same trust model as /team: outside the
 * (app) group, in PUBLIC_PATHS, token-cookie authenticated — the same cookie
 * opens both surfaces, so members switch between them freely.
 */
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    // Own scroll container: globals.css pins html/body to overflow:hidden for
    // the app shell, so this surface must manage its own height.
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Same fix as /team's layout: hub components (reply requests, tag
          panel, private-reads toggle) call useToast(), and this surface sits
          outside the (app) shell that mounts the provider. */}
      <ToastProvider>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </ToastProvider>
    </div>
  );
}
