import { SetPageTitle } from '@/components/layout/page-title';
import { SessionsClient } from './sessions-client';

/**
 * /settings/sessions: the logins THIS DEVICE is holding. Data-free, and unlike
 * every other settings screen it has no API behind it at all: the list lives in
 * this browser (session-registry.ts). The brain's own "Logins" screen is a
 * different thing, the people who may sign in to this brain, which is why this
 * one says "on this device" everywhere a person reads its name.
 */
export default async function SessionsSettingsPage() {
  return (
    <>
      <SetPageTitle title="Logins on this device" />
      <SessionsClient />
    </>
  );
}
