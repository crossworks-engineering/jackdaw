'use client';

import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { DebugNav } from './debug-nav';

/**
 * Shared frame for the debug section: master-detail, the tab cards left, the
 * selected tab right.
 *
 * This is a Next.js layout, so the detail IS `children` — whichever of the
 * twelve `page.tsx` files the route resolves to. Putting the nav here rather
 * than in each page is what makes its stat queries mount ONCE for the section
 * instead of re-firing on every tab change (see `debug-nav.tsx`).
 *
 * `detailFills`: the debug tabs are dashboards, wide tables and a three-column
 * retrieval audit — none of it is a measure of reading prose, and the default
 * 672px detail cap would squeeze every one of them. The pages each carried
 * their own `mx-auto max-w-6xl` before this; the divider is the measure now, so
 * they hug it and never centre (§8).
 *
 * No `SetPageTitle` here: each page still sets its own, so the title says which
 * TAB you are on rather than just "Debug".
 */
export default function DebugLayout({ children }: { children: React.ReactNode }) {
  return (
    <MasterDetail
      id="debug"
      // Wider than the 340px default: these cards carry a description line and
      // a stat line, and at 340 the stats wrapped or truncated on most tabs.
      defaultListSize="380px"
      minListSize="300px"
      maxListSize="560px"
      detailFills
      list={<DebugNav />}
      detail={children}
    />
  );
}
