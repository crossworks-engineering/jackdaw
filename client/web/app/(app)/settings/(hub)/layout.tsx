'use client';

import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { SettingsNav } from './settings-nav';

/**
 * Shared frame for the settings HUB: master-detail, one card per screen on the
 * left, the screen itself on the right.
 *
 * ⚠ The `(hub)` route group is the whole point of this file's location. A
 * layout applies to every route beneath it, so `settings/layout.tsx` would put
 * this rail beside `/settings/agents` too — a list inside a list. A route group
 * changes the FILE TREE and not the path: every `/settings/<name>` URL is
 * exactly what it was, and the twelve collection screens (agents, keys,
 * accounts…) stay outside the group and keep their own shape.
 *
 * Like `/debug`, this is a Next.js layout, so the detail IS `children` —
 * whichever of the thirteen `page.tsx` files the route resolved to. Putting the
 * nav here rather than in each page is what makes its queries mount ONCE for
 * the section instead of re-firing on every card click.
 *
 * No `detailFills`, unlike `/debug`: these thirteen are FORMS, and the 672px
 * default measure is what keeps their fields off 1200px line lengths. The
 * screens each centred themselves in an `mx-auto max-w-2xl` before this; those
 * caps are gone, because a pane that is already a measure AND draggable, with a
 * second cap inside it, leaves the drag with nothing to do (§8).
 *
 * No `SetPageTitle` here: each page still sets its own, so the title says which
 * SCREEN you are on rather than just "Settings".
 */
export default function SettingsHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <MasterDetail
      id="settings-hub"
      // Wider than the 340px default, same as `/debug`: these cards carry a
      // description line under the title.
      defaultListSize="380px"
      minListSize="300px"
      maxListSize="560px"
      // The detail OPENS at the 672px measure, but it must be able to be
      // dragged out to everything the shell leaves it — `appearance` is a
      // gallery of ~40 theme swatches and ~34 avatar styles in two columns, and
      // at 672px both are cramped while an empty spacer holds 500px of the
      // window. `100%` lets the drag run the spacer down to nothing, so the
      // ceiling is the window minus the rail and the Activity column rather
      // than an arbitrary 1100px.
      maxDetailSize="100%"
      list={<SettingsNav />}
      detail={children}
    />
  );
}
