import { ToastProvider } from '@mantle/web-ui/ui/toast';
import { MemberShell } from '@/components/member/member-shell';

/**
 * The MEMBER surface (member logins, Phase 1): what a member login sees. It
 * sits outside the (app) shell on purpose: every admin screen and API refuses
 * a member, so the owner chrome would only fire requests that fail. The brain
 * decides what a member may read (row security at the team level); this
 * surface only shows it.
 */
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    // Own scroll container: globals.css pins html/body to overflow:hidden.
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* ToastProvider: outside the (app) shell nothing else mounts it, and
          useToast() throws without it. */}
      <ToastProvider>
        <MemberShell>{children}</MemberShell>
      </ToastProvider>
    </div>
  );
}
