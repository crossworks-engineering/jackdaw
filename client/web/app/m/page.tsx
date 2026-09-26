import { Suspense } from 'react';
import { MemberLibrary } from '@/components/member/member-library';

export const metadata = { title: 'Library' };

export default function MemberLibraryPage() {
  // useSearchParams (the selected item) needs a Suspense boundary.
  return (
    <Suspense>
      <MemberLibrary />
    </Suspense>
  );
}
