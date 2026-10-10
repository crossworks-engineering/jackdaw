import { AreaGate } from '@/components/workspaces/area-gate';

/**
 * Every settings screen, gated by the areas the login holds (workspaces W5a,
 * plan 1.4). A gate and nothing else: no frame, no pane. The `(hub)` group
 * keeps its own measured pane (see its layout), and the collection screens
 * keep their master-detail.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AreaGate>{children}</AreaGate>;
}
