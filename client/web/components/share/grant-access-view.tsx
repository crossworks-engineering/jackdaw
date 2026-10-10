'use client';

import type { ReactNode } from 'react';
import { FolderOpen, Lock, Plus, X } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import { Switch } from '@mantle/web-ui/ui/switch';
// Relative, not '@/': the node test runner renders this (grant-access-view.test.ts).
import {
  APP_MCP_HINT,
  BRIDGE_OWNED_TEXT,
  APP_MCP_LABEL,
  NO_ADDABLE_TEXT,
  READ_ONLY_PANEL_TEXT,
  embedsLine,
  rowActions,
  rowNote,
  sortAddable,
  sortRows,
  writeLabel,
  writeWord,
  type GrantRow,
  type GrantsView,
} from '../../lib/grants';

export type GrantAccessHandlers = {
  onWrite: (row: GrantRow, write: boolean) => void;
  onRemove: (row: GrantRow) => void;
  onRestore: (row: GrantRow) => void;
  /** "Change here": a folder row becomes the item's own. */
  onHand: (row: GrantRow) => void;
  onAdd: (ws: { wsId: string; name: string }) => void;
  /** Move the item to another workspace (its home row). */
  onMove: (ws: { wsId: string; name: string }) => void;
  onGrantEmbeds: () => void;
  onMcpAccess: (on: boolean) => void;
};

/**
 * The Grant Access panel's body (plan 7.1): the item's workspaces, one row
 * each (name, Write switch, "Via folder X" with "Change here", remove;
 * "Removed here" with Restore), "Add workspace" over the workspaces the user
 * moderates, the embeds not granted where the item is (with "Grant these
 * too"), and on an app its MCP access. A user who may not manage reads the
 * same rows with no controls. Pure: the host loads and writes.
 */
export function GrantAccessView({
  view,
  busy,
  adminWsId,
  type,
  hint,
  link,
  ...on
}: {
  view: GrantsView;
  busy: boolean;
  /** The Admin workspace, offered first to an Admin user (21.8). */
  adminWsId: string | null;
  /** The item's kind, when known ('app' words its Write switch). */
  type?: string;
  hint?: string;
  /** The open link and the contact shares, under the rows (8.1, kept). */
  link?: ReactNode;
} & GrantAccessHandlers) {
  const manage = view.mayManage;
  const rows = sortRows(view.rows);
  const addable = sortAddable(view.addable, adminWsId);
  // A move goes to a workspace the user moderates: one it may add, or one
  // the item is granted to already (the brain refuses the others).
  const moveTargets = sortAddable(
    [
      ...view.rows
        .filter((r) => !r.isHome && !r.excluded)
        .map((r) => ({ wsId: r.wsId, name: r.name })),
      ...view.addable,
    ],
    adminWsId,
  );
  const embeds = view.embedsNotGranted;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Who can see this</p>
        {!manage && <p className="text-xs text-muted-foreground">{READ_ONLY_PANEL_TEXT}</p>}
        <ul aria-label="Workspaces" className="space-y-1.5">
          {rows.map((row) => {
            const can = rowActions(row);
            const note = rowNote(row);
            return (
              <li
                key={row.wsId}
                className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      row.excluded
                        ? 'truncate text-sm text-muted-foreground line-through'
                        : 'truncate text-sm'
                    }
                  >
                    {row.name}
                  </p>
                  {note && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {row.viaFolder && <FolderOpen className="size-3 shrink-0" aria-hidden />}
                      <span className="min-w-0 truncate">{note}</span>
                    </p>
                  )}
                  {row.bridgeOwned && manage && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3 shrink-0" aria-hidden />
                      <span className="min-w-0">{BRIDGE_OWNED_TEXT}</span>
                    </p>
                  )}
                </div>
                {manage && !row.bridgeOwned ? (
                  <>
                    {can.changeHere && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => on.onHand(row)}
                      >
                        Change here
                      </Button>
                    )}
                    {can.restore && (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busy}
                        onClick={() => on.onRestore(row)}
                      >
                        Restore
                      </Button>
                    )}
                    {can.move && moveTargets.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="xs" variant="ghost" disabled={busy}>
                            Move…
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Move it to</DropdownMenuLabel>
                          {moveTargets.map((w) => (
                            <DropdownMenuItem key={w.wsId} onSelect={() => on.onMove(w)}>
                              {w.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {!row.excluded && (
                      <Switch
                        checked={row.write}
                        disabled={busy || !can.write}
                        onCheckedChange={(v) => on.onWrite(row, v)}
                        aria-label={writeLabel(type, row.name)}
                        title={
                          can.write
                            ? writeLabel(type, row.name)
                            : `${writeWord(row.write)}: set by the folder. Change here first.`
                        }
                      />
                    )}
                    {can.remove && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => on.onRemove(row)}
                        aria-label={`Remove ${row.name}`}
                        title={`Remove ${row.name}`}
                      >
                        <X />
                      </Button>
                    )}
                  </>
                ) : (
                  !row.excluded && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {writeWord(row.write)}
                    </span>
                  )
                )}
              </li>
            );
          })}
        </ul>
        {manage &&
          (addable.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy}>
                  <Plus />
                  Add workspace
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Share with</DropdownMenuLabel>
                {addable.map((w) => (
                  <DropdownMenuItem key={w.wsId} onSelect={() => on.onAdd(w)}>
                    {w.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <p className="text-xs text-muted-foreground">{NO_ADDABLE_TEXT}</p>
          ))}
      </div>

      {embeds.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{embedsLine(embeds.length)}</p>
          <ul className="scrollbar-thin scrollbar-hair max-h-28 space-y-0.5 overflow-y-auto text-xs">
            {embeds.map((e) => (
              <li key={e.nodeId} className="flex min-w-0 justify-between gap-2">
                <span className="min-w-0 truncate">{e.title || 'Untitled'}</span>
                <span className="shrink-0 text-muted-foreground">{e.kind}</span>
              </li>
            ))}
          </ul>
          {manage && (
            <Button size="sm" variant="outline" disabled={busy} onClick={on.onGrantEmbeds}>
              Grant these too
            </Button>
          )}
        </div>
      )}

      {view.app && (
        <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="text-sm">{APP_MCP_LABEL}</p>
            <p className="text-xs text-muted-foreground">{APP_MCP_HINT}</p>
          </div>
          {manage ? (
            <Switch
              checked={view.app.mcpAccess}
              disabled={busy}
              onCheckedChange={on.onMcpAccess}
              aria-label="MCP access"
            />
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">
              {view.app.mcpAccess ? 'On' : 'Off'}
            </span>
          )}
        </div>
      )}

      {link}

      {hint && manage && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
