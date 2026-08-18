import { SetPageTitle } from '@/components/layout/page-title';
import { ToolValidationClient } from './tool-validation-client';

/** Debug → Tool validation: the central arg-validator's warn-mode telemetry
 *  (what enforce would have bounced). Data-free — the client fetches
 *  GET /api/debug/tool-validation. */
export default async function DebugToolValidationPage() {
  return (
    <div className="space-y-8 px-6 py-8">
      <SetPageTitle title="Tool validation" />
      <ToolValidationClient />
    </div>
  );
}
