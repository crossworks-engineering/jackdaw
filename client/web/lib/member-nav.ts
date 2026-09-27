import {
  AppWindow,
  BookText,
  FileText,
  FolderTree,
  Home,
  MessageSquare,
  PenTool,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { MEMBER_ITEM_KINDS, MEMBER_KIND, type MemberItemKind } from './member-kinds';

const KIND_ICON: Record<MemberItemKind, LucideIcon> = {
  page: BookText,
  note: FileText,
  draw: PenTool,
  table: Table2,
  file: FolderTree,
};

/** `chat` opens the assistant dock beside the current screen instead of
 *  navigating (member logins, Phase 3). */
export type MemberNavItem = { name: string; href: string; icon: LucideIcon; chat?: true };

/** What a member reaches (member logins, plan section 7): their home, the five
 *  workspace kinds (each with Mine, Team drafts and the Library), the apps
 *  they may run (Phase 4b), and chat. */
export const MEMBER_NAV: { label: string; items: MemberNavItem[] }[] = [
  { label: 'Home', items: [{ name: 'Home', href: '/', icon: Home }] },
  {
    label: 'Workspace',
    items: [
      ...MEMBER_ITEM_KINDS.map((k) => ({
        name: MEMBER_KIND[k].title,
        href: MEMBER_KIND[k].path,
        icon: KIND_ICON[k],
      })),
      { name: 'Apps', href: '/apps', icon: AppWindow },
    ],
  },
  { label: 'Assistant', items: [{ name: 'Chat', href: '#chat', icon: MessageSquare, chat: true }] },
];
