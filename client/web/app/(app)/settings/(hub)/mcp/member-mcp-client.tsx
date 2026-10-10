'use client';

/**
 * A member's own Settings > MCP (brain team apps Phase 1). The connector URL
 * and how to connect, their own access (read only: an admin sets it), and
 * the MCP clients THEY connected, each with Disconnect. The box switch and
 * Team and client access stay the admin's screen (./mcp-client.tsx).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Database, KeyRound, Loader2, Plug, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@mantle/web-ui/ui/alert-dialog';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { copyText } from '@mantle/web-ui/lib/secure-context-fallbacks';
import {
  MEMBER_MCP_NOT_OPEN,
  MEMBER_MCP_PATH,
  claudeCodeKeyCommand,
  claudeCodeOauthCommand,
  memberMcpAccessLines,
  connectorLine,
  memberMcpClientPath,
  type MemberMcpView,
} from '@/lib/member-mcp';

function CopyLine({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
        {value}
      </code>
      <Button
        variant="outline"
        size="sm"
        aria-label={label}
        onClick={async () => {
          try {
            await copyText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error('Copy failed. Select the text and copy it.');
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function OnOff({ name, on }: { name: string; on: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      {name}
      <Badge variant={on ? 'default' : 'secondary'}>{on ? 'On' : 'Off'}</Badge>
    </span>
  );
}

export function MemberMcpClient() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['member-mcp'],
    queryFn: () => apiFetch<MemberMcpView>(MEMBER_MCP_PATH),
  });
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function disconnect(id: string) {
    setDisconnecting(id);
    try {
      await apiSend(memberMcpClientPath(id), 'DELETE');
      await queryClient.invalidateQueries({ queryKey: ['member-mcp'] });
      toast.success('Disconnected');
    } catch {
      toast.error('Could not disconnect');
    } finally {
      setDisconnecting(null);
    }
  }

  if (query.isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <div className="p-6 text-sm text-destructive-ink">Could not load your MCP access.</div>;
  }

  const view = query.data;
  const access = memberMcpAccessLines(view);

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="w-full space-y-6 p-4 md:p-6">
        {/* Connect */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start gap-3 border-b border-border p-4 md:p-5">
            <div className="mt-0.5 rounded-lg bg-accent p-2 text-accent-foreground">
              <Plug className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Connect your MCP client</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use this brain from Claude or another MCP client, with your own login&apos;s rights
                and nothing more.
              </p>
            </div>
          </div>
          {view.remoteEnabled && view.access.enabled ? (
            <div className="space-y-4 p-4 md:p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Connector URL</p>
                <CopyLine value={view.connectorUrl} label="Copy the connector URL" />
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How to connect</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  <li>
                    Claude (web or desktop): open Settings, then Connectors, then Add custom
                    connector. Paste the URL and sign in with your own login.
                  </li>
                  <li>Claude Code: run this, then sign in when asked.</li>
                </ul>
                <CopyLine
                  value={claudeCodeOauthCommand(view.connectorUrl)}
                  label="Copy the Claude Code command"
                />
                <p className="mt-3">
                  A client that cannot sign in uses an API key instead. Make one in{' '}
                  <Link href="/settings/api-access" className="underline underline-offset-2">
                    API access
                  </Link>{' '}
                  and send it as a header:
                </p>
                <CopyLine
                  value={claudeCodeKeyCommand(view.connectorUrl)}
                  label="Copy the API key command"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground md:p-5">{MEMBER_MCP_NOT_OPEN}</div>
          )}
        </section>

        {/* Your access */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start gap-3 border-b border-border p-4 md:p-5">
            <div className="mt-0.5 rounded-lg bg-accent p-2 text-accent-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Your access</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                An admin of this brain sets these for your login.
              </p>
            </div>
          </div>
          <div className="space-y-3 p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-4">
              <OnOff name="MCP" on={view.access.enabled} />
              <OnOff name="Write" on={view.access.enabled && view.access.writeEnabled} />
            </div>
            <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
              {access.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              <KeyRound className="mr-1 inline size-3.5" />
              Your API keys are in{' '}
              <Link href="/settings/api-access" className="underline underline-offset-2">
                API access
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Data sources (connectors) the member's workspaces hold (contract 28) */}
        {view.connectors !== undefined && (
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-start gap-3 border-b border-border p-4 md:p-5">
              <div className="mt-0.5 rounded-lg bg-accent p-2 text-accent-foreground">
                <Database className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Data sources you can use</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connectors your workspaces hold. Their tools are on your MCP and in the apps you
                  run.
                </p>
              </div>
            </div>
            {view.connectors.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground md:p-5">
                No data source is open to you yet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {view.connectors.map((c) => (
                  <li key={c.id} className="p-4 md:px-5">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {connectorLine(c, view.access.enabled && view.access.writeEnabled)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Your connected clients */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4 md:p-5">
            <h2 className="text-sm font-semibold">Your connected clients</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The MCP clients you signed in with. Disconnect one to end its access at once.
            </p>
          </div>
          {view.clients.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground md:p-5">
              No connected clients yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {view.clients.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 p-4 md:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.clientName || 'Unnamed client'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Connected {formatDateTime(c.connectedAt)}
                      {c.lastUsedAt
                        ? ` · last used ${formatDateTime(c.lastUsedAt)}`
                        : ' · not used yet'}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive-ink"
                        disabled={disconnecting === c.id}
                      >
                        {disconnecting === c.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect this client?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {c.clientName || 'This client'} loses access at once. You can connect it
                          again later by signing in.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => disconnect(c.id)}
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
