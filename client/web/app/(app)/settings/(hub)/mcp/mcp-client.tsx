'use client';

/**
 * Settings > MCP: one screen for every user (workspaces W7b). The connector
 * URL and how to connect, the data sources the login's workspaces hold, and
 * the connected clients with Disconnect. An Admin user with the Connectors
 * area reads the brain's side (`source="brain"`): the box switch, the
 * endpoint check and every client. Any other user reads its own side
 * (`source="own"`): its own connection info and the clients it connected.
 * No per-login switch: every login has the one MCP surface in its own
 * workspaces. The routes are lib/mcp-screen.ts.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Database,
  KeyRound,
  Loader2,
  Plug,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Switch } from '@mantle/web-ui/ui/switch';
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
import { cn } from '@mantle/web-ui/lib/utils';
import { copyText } from '@mantle/web-ui/lib/secure-context-fallbacks';
import {
  MCP_SETTINGS_PATH,
  READ_LINE,
  WRITE_LINE,
  claudeCodeKeyCommand,
  claudeCodeOauthCommand,
  connectorLine,
  mcpClientPath,
  mcpClientsText,
  mcpOffText,
  mcpScreenView,
  mcpViewPath,
  type McpScreenView,
  type McpSettings,
  type McpSource,
  type MemberMcpView,
} from '@/lib/mcp-screen';

type CheckResult = { ok: boolean; status: number; message: string };

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

/** The read of either route, as the one view. */
async function readView(source: McpSource): Promise<McpScreenView> {
  return source === 'brain'
    ? mcpScreenView('brain', await apiFetch<McpSettings>(MCP_SETTINGS_PATH))
    : mcpScreenView('own', await apiFetch<MemberMcpView>(mcpViewPath('own')));
}

export function McpSettingsClient({ source }: { source: McpSource }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const queryKey = ['mcp-screen', source];
  const query = useQuery({ queryKey, queryFn: () => readView(source) });

  const [toggling, setToggling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  async function setEnabled(next: boolean) {
    setToggling(true);
    try {
      await apiSend(MCP_SETTINGS_PATH, 'PATCH', { enabled: next });
      setCheck(null);
      await invalidate();
      toast.success(next ? 'Remote MCP enabled' : 'Remote MCP disabled');
    } catch {
      toast.error('Could not update');
    } finally {
      setToggling(false);
    }
  }

  async function runCheck() {
    setChecking(true);
    setCheck(null);
    try {
      setCheck(await apiSend<CheckResult>('/api/mcp-status', 'POST'));
    } catch {
      setCheck({ ok: false, status: 0, message: 'Check failed to run.' });
    } finally {
      setChecking(false);
    }
  }

  async function disconnect(id: string) {
    setDisconnecting(id);
    try {
      await apiSend(mcpClientPath(source, id), 'DELETE');
      await invalidate();
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
    return <div className="p-6 text-sm text-destructive-ink">Could not load MCP settings.</div>;
  }

  const view = query.data;
  const brain = view.source === 'brain';
  const clientsText = mcpClientsText(view.source);

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="w-full space-y-6 p-4 md:p-6">
        {/* Connector card */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-accent p-2 text-accent-foreground">
                <Plug className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Remote MCP connector</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use this brain from Claude or another MCP client, with your own login&apos;s
                  rights and nothing more.
                </p>
              </div>
            </div>
            {brain && (
              <Switch
                checked={view.remoteEnabled}
                disabled={toggling}
                onCheckedChange={setEnabled}
                aria-label="Enable remote MCP"
              />
            )}
          </div>

          {view.remoteEnabled ? (
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

              {brain ? (
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={runCheck} disabled={checking}>
                    {checking ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                    Check endpoint
                  </Button>
                  {check && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-sm',
                        check.ok ? 'text-foreground' : 'text-destructive-ink',
                      )}
                    >
                      {check.ok ? (
                        <Check className="size-4" />
                      ) : (
                        <TriangleAlert className="size-4" />
                      )}
                      {check.message}
                    </span>
                  )}
                </div>
              ) : (
                <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
                  <li>{READ_LINE}</li>
                  <li>{WRITE_LINE}</li>
                  <li>
                    <KeyRound className="mr-1 inline size-3.5" />
                    Your API keys are in{' '}
                    <Link href="/settings/api-access" className="underline underline-offset-2">
                      API access
                    </Link>
                    .
                  </li>
                </ul>
              )}
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground md:p-5">
              {mcpOffText(view.source)}
            </div>
          )}
        </section>

        {/* Data sources (connectors) the login's workspaces hold */}
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
                    <p className="mt-0.5 text-xs text-muted-foreground">{connectorLine(c)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Connected clients */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4 md:p-5">
            <h2 className="text-sm font-semibold">{clientsText.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{clientsText.hint}</p>
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
                          {c.clientName || 'This client'} loses access at once. It can connect again
                          later by signing in.
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
