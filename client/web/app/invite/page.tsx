import { NeatBackdrop } from '@mantle/web-ui/neat-backdrop';
import { decodeNeatSpec } from '@mantle/share-ui/neat-background';
import { loadBrainAppearance } from '@/lib/appearance';
import { readBrandFields, resolveLoginBrand } from '@/lib/brand';
import { LoginMark } from '../login/login-mark';
import { LoginCredit } from '../login/login-credit';
import { InviteClient } from './invite-client';

/**
 * /invite: a person redeems a member invite (member logins, Phase 6). They
 * open the link an admin handed them (`/invite?code=…`) or type a code (an
 * invite code, or an old 8-character team code while the admin has an open
 * invite for them), set a password, and are signed in as a member.
 *
 * Public (PUBLIC_PREFIXES in middleware.ts), and never bounced away by a
 * session cookie: someone signed in on this browser can still accept. Wears
 * the sign-in screen's look, brand block and all; see app/login/page.tsx for
 * why the brand is resolved here, on the server.
 */
export default async function InvitePage({
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
          <InviteClient
            mark={<LoginMark brand={brand} srcBase={process.env.MANTLE_SERVER_ORIGIN} />}
            initialCode={code}
          />
        </div>
      </div>
      {brand.kind !== 'jackdaw' && <LoginCredit />}
    </main>
  );
}
