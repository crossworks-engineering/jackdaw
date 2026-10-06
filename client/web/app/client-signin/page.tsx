import type { Metadata } from 'next';
import { NeatBackdrop } from '@mantle/web-ui/neat-backdrop';
import { decodeNeatSpec } from '@mantle/share-ui/neat-background';
import { loadBrainAppearance } from '@/lib/appearance';
import { clientLoginBrand, clientTabTitle, readBrandFields } from '@/lib/brand';
import { loadClientCodesEnabled } from '@/lib/client-code-availability';
import { LoginMark } from '../login/login-mark';
import { LoginCredit } from '../login/login-credit';
import { LinkCodeScript } from '@/components/link-code-script';
import { ClientSigninClient } from './client-signin-client';

/** The tab: the site name, else the product's. Never the peer name (a box's
 *  identifier is staff knowledge), and `absolute`, so the root layout's
 *  template does not add it back. */
export async function generateMetadata(): Promise<Metadata> {
  const fields = readBrandFields(await loadBrainAppearance());
  return { title: { absolute: `Sign in · ${clientTabTitle(fields)}` } };
}

/**
 * /client-signin: a CLIENT login signs in (client logins C2). An admin
 * issues a sign-in link in Team admin > Clients (`/client-signin#code=…`,
 * one use, 72 hours; `?code=…` in links issued before) and hands it over;
 * the client opens it, types their
 * email as a check, and is signed in for 30 days. A client has no password.
 * A client without a link signs in with a code mailed to them (C2b), when
 * this brain sends codes: asked here, on the server, so the first paint is
 * the right way in.
 *
 * Public (PUBLIC_PREFIXES in middleware.ts), and where a client whose
 * session ended lands: the middleware sends a hinted client's /login here.
 * Wears the sign-in screen's look, brand block and all (never the peer
 * name: a client sees the brand); see app/login/page.tsx for why the brand
 * is resolved here, on the server. Served with `Referrer-Policy:
 * no-referrer` (next.config.ts), and the inline script takes the code out of
 * the address before anything else loads (lib/link-code.ts).
 */
export default async function ClientSigninPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const [params, appearance, codesEnabled] = await Promise.all([
    searchParams,
    loadBrainAppearance(),
    loadClientCodesEnabled(),
  ]);
  const brand = clientLoginBrand(readBrandFields(appearance));
  const neat = decodeNeatSpec(appearance?.neatBackground);
  const code = typeof params.code === 'string' ? params.code : '';

  return (
    <main className="relative isolate flex min-h-screen flex-col bg-background px-4 py-8">
      <LinkCodeScript />
      {neat && <NeatBackdrop spec={neat} className="-z-10" resolution={0.75} />}
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-sm space-y-8">
          <ClientSigninClient
            mark={<LoginMark brand={brand} srcBase={process.env.MANTLE_SERVER_ORIGIN} />}
            initialCode={code}
            codesEnabled={codesEnabled}
          />
        </div>
      </div>
      <LoginCredit showJackdaw={brand.kind !== 'jackdaw'} />
    </main>
  );
}
