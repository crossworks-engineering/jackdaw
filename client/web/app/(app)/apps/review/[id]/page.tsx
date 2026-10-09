import { redirect } from 'next/navigation';
import { reviewAppHref } from '@/lib/space-apps';

/**
 * The old review screen's address. A member's app opens in the Apps pane
 * now, beside the tree like any app (`/apps?review=<id>`), so a link or a
 * bookmark to this one lands there.
 */
export default async function MemberAppReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(reviewAppHref(id));
}
