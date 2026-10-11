import Link from 'next/link';
import { SystemVitals } from '@/components/dashboard/system-vitals';
import { OpenQuestions } from '@/components/dashboard/open-questions';
import { SetPageTitle } from '@/components/layout/page-title';
import { DashboardClient } from './dashboard-client';
import { HomeSwitch } from '@/components/home/plain-home';
import { MemberHomeSwitch } from '@/components/member/member-home-app';

/**
 * Dashboard — the "brain health" overview. Data-free: the live host/Postgres
 * vitals come from the <SystemVitals> island polling /api/health, and the
 * brain metrics (KPIs, charts, ops panels) are fetched by <DashboardClient>
 * from GET /api/dashboard. The deep operator view stays at /debug.
 *
 * The dashboard is an admin's with the settings area; a member gets its own
 * home, anyone else the plain home (components/home/plain-home.tsx).
 */
export default async function DashboardPage() {
  return (
    <HomeSwitch
      member={<MemberHomeSwitch />}
      dashboard={
        <div className="@container/dashboard space-y-6 p-4 md:p-6">
          <SetPageTitle title="Dashboard" />
          <header className="flex flex-wrap items-center justify-end gap-2">
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/debug" className="text-primary-ink underline-offset-2 hover:underline">
                Operator view
              </Link>
              <Link href="/traces" className="text-primary-ink underline-offset-2 hover:underline">
                Traces
              </Link>
            </nav>
          </header>

          <SystemVitals />

          <OpenQuestions />

          <DashboardClient />
        </div>
      }
    />
  );
}
