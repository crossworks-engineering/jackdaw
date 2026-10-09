import { Suspense } from 'react';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { ReviewRedirect } from '@/components/review/review-redirect';

/**
 * /review[?item=<id>]: no screen of its own. A member's submitted item is
 * reviewed in its workspace (Pages, Notes, Tables, Draw, Files), and this
 * address forwards there (workspace review pattern, 2026-10-09).
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <ReviewRedirect item={item ?? null} />
    </Suspense>
  );
}
