/**
 * Removed in W5c: the review sections ("Waiting for approval", "Shared by
 * members") went with the review flow. The generic section list moved to
 * components/item-list/list-sections.tsx. This re-export stays ONLY for
 * app/(app)/settings/users/users-client.tsx and
 * components/member/member-item-sections.tsx, which other W5c parts own:
 * point them at ListSections and delete this file.
 */
export {
  ListSections as ReviewSections,
  type ListSection as ReviewSection,
  type ListSectionRow as ReviewSectionRow,
} from '@/components/item-list/list-sections';
