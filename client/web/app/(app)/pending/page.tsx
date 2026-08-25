import { SetPageTitle } from '@/components/layout/page-title';
import { MeasuredPane } from '@mantle/web-ui/ui/measured-pane';
import { PendingClient } from './pending-client';

/**
 * Pending approvals: data-free. PendingClient fetches the rows from
 * GET /api/pending and decides via PATCH /api/pending/[id].
 *
 * The settings-hub treatment: one measured column tucked left with a draggable
 * right edge, remembered per screen — not a centred `mx-auto` strip. Opens at
 * the 4xl measure the centred column used.
 */
export default async function PendingPage() {
  return (
    <MeasuredPane id="pending" defaultSize="896px">
      <SetPageTitle title="Pending approvals" />
      <div className="space-y-6 px-6 py-8">
        <PendingClient devMode={process.env.NODE_ENV !== 'production'} />
      </div>
    </MeasuredPane>
  );
}
