import { loadBrainAppearance } from '@/lib/appearance';
import { readBrandFields, resolveLoginBrand } from '@/lib/brand';
import { LoginClient } from './login-client';
import { LoginMark } from './login-mark';

/**
 * Owner sign-in screen, zero-secret flavor: no server session read (this app
 * can't verify one). Already-holding-a-bearer visitors bounce straight in;
 * fresh installs (GET /api/auth/bootstrap-state — public, boolean-only) get
 * the create-account variant, exactly like the monolith's first-run gate. Both
 * of those live in `LoginClient`.
 *
 * A SERVER component now, where it used to be a client one, for one reason:
 * the screen wears the BRAIN's branding — an uploaded logo, else the site name
 * in the owner's chosen face, else the Jackdaw lockup — and resolving that
 * after mount would flash the wrong brand on every load. `loadBrainAppearance`
 * is the same cached, public, server-to-server fetch the root layout already
 * awaits, so this costs no extra request; it reads no session and remains
 * zero-secret.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [params, appearance] = await Promise.all([searchParams, loadBrainAppearance()]);
  const brand = resolveLoginBrand(readBrandFields(appearance));

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <LoginClient mark={<LoginMark brand={brand} />} next={params.next} error={params.error} />
      </div>
    </main>
  );
}
