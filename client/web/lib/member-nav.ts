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
      { name: 'Pages', href: '/pages', icon: BookText },
      { name: 'Notes', href: '/notes', icon: FileText },
      { name: 'Draw', href: '/draw', icon: PenTool },
      { name: 'Tables', href: '/tables', icon: Table2 },
      { name: 'Files', href: '/files', icon: FolderTree },
      { name: 'Apps', href: '/apps', icon: AppWindow },
    ],
  },
  { label: 'Assistant', items: [{ name: 'Chat', href: '#chat', icon: MessageSquare, chat: true }] },
];
