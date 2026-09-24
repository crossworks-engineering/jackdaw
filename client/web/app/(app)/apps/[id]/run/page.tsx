import { AppRunClient } from './app-run-client';

/**
 * Run an app full-pane: where the sidebar's app rows lead. Data-free, like the
 * editor beside it; AppRunClient fetches the app and mounts its sandbox.
 */
export default async function AppRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppRunClient id={id} />;
}
