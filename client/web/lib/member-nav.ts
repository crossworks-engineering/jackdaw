import {
  AppWindow,
  BookText,
  FileText,
  FolderTree,
  Home,
  KeyRound,
  Layers,
  MessageSquare,
  PenTool,
  Plug,
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
 *  they may run (Phase 4b), chat, and their own API keys. */
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
  // Their own MCP view (team apps Phase 1), their workspaces (W5a) and their
  // own API keys, for scripts and MCP clients (brain migration 0232).
  {
    label: 'You',
    items: [
      { name: 'MCP', href: '/settings/mcp', icon: Plug },
      // The workspaces they are in (workspaces W5a): read, or manage as a
      // Moderator. Members read GET /api/workspaces (their shell has none).
      { name: 'Workspaces', href: '/settings/workspaces', icon: Layers },
      { name: 'API access', href: '/settings/api-access', icon: KeyRound },
    ],
  },
];
