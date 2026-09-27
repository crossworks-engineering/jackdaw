/**
 * The five kinds a member works with, and everything the client says about
 * each: its screen, its names and its emoji. The ONE map (audit M2): the
 * home, the workspace, the review dialog, the nav and the route guard read
 * it. The kind list itself is the brain's (@mantle/client-types). Plain data
 * on purpose: middleware reads the paths, so no React or icon import here
 * (the nav's icons sit in member-nav.ts).
 */
import { MEMBER_ITEM_KINDS, type MemberItemKind } from '@mantle/client-types/member-kinds';

export { MEMBER_ITEM_KINDS, type MemberItemKind };

export type MemberKindInfo = {
  /** The screen that lists and opens it. */
  path: string;
  /** The screen's name. */
  title: string;
  /** One of it, and more than one, in a sentence. */
  one: string;
  many: string;
  icon: string;
  /** "New" makes one; files come by upload instead. */
  create: boolean;
  upload?: true;
};

export const MEMBER_KIND: Record<MemberItemKind, MemberKindInfo> = {
  page: { path: '/pages', title: 'Pages', one: 'page', many: 'pages', icon: '📄', create: true },
  note: { path: '/notes', title: 'Notes', one: 'note', many: 'notes', icon: '📝', create: true },
  draw: {
    path: '/draw',
    title: 'Draw',
    one: 'drawing',
    many: 'drawings',
    icon: '✏️',
    create: true,
  },
  table: {
    path: '/tables',
    title: 'Tables',
    one: 'table',
    many: 'tables',
    icon: '📊',
    create: true,
  },
  file: {
    path: '/files',
    title: 'Files',
    one: 'file',
    many: 'files',
    icon: '📎',
    create: false,
    upload: true,
  },
};

/** The kinds' screens, in the kinds' order. */
export const MEMBER_KIND_PATHS: readonly string[] = MEMBER_ITEM_KINDS.map(
  (k) => MEMBER_KIND[k].path,
);
