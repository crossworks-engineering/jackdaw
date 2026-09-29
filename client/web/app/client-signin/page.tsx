import { NeatBackdrop } from '@mantle/web-ui/neat-backdrop';
import { decodeNeatSpec } from '@mantle/share-ui/neat-background';
import { loadBrainAppearance } from '@/lib/appearance';
import { readBrandFields, resolveLoginBrand } from '@/lib/brand';
import { LoginMark } from '../login/login-mark';
import { LoginCredit } from '../login/login-credit';
import { ClientSigninClient } from './client-signin-client';

/**
 * /client-signin: a CLIENT login signs in (client logins C2). An admin
 * issues a sign-in link in Team admin > Clients (`/client-signin?code=…`,
 * one use, 72 hours) and hands it over; the client opens it, types their
 * email as a check, and is signed in for 30 days. A client has no password.
 *
 * Public (PUBLIC_PREFIXES in middleware.ts), and where a client whose
 * session ended lands: the middleware sends a hinted client's /login here.
 * Wears the sign-in screen's look, brand block and all; see
 * app/login/page.tsx for why the brand is resolved here, on the server.
 */
export default async function ClientSigninPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const [params, appearance] = await Promise.all([searchParams, loadBrainAppearance()]);
  const brand = resolveLoginBrand(readBrandFields(appearance));
  const neat = decodeNeatSpec(appearance?.neatBackground);
  const code = typeof params.code === 'string' ? params.code : '';

  return (
    <main className="relative isolate flex min-h-screen flex-col bg-background px-4 py-8">
      {neat && <NeatBackdrop spec={neat} className="-z-10" resolution={0.75} />}
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-sm space-y-8">
          <ClientSigninClient
            mark={<LoginMark brand={brand} srcBase={process.env.MANTLE_SERVER_ORIGIN} />}
            initialCode={code}
          />
        </div>
      </div>
      {brand.kind !== 'jackdaw' && <LoginCredit />}
    </main>
  );
}
