import { cn } from '@mantle/web-ui/lib/utils';
import { appDataPill, appMcpPill, type AppPill } from '../../lib/app-data-pill';

const TONE: Record<AppPill['tone'], string> = {
  read: 'border-border text-muted-foreground',
  write: 'border-primary/40 text-primary',
  info: 'border-border text-muted-foreground',
};

function Pill({ pill }: { pill: AppPill }) {
  return (
    <span
      title={pill.title}
      aria-label={pill.title}
      className={cn(
        'inline-flex h-4 shrink-0 items-center rounded-sm border px-1 text-[10px] font-medium leading-none',
        TONE[pill.tone],
      )}
    >
      {pill.label}
    </span>
  );
}

/**
 * The pills on an app in an app menu (brain team apps Phase 3): R or R/W for
 * what the viewer may do with its data, as the brain sent it (`dataAccess`),
 * and for an admin an MCP pill while the app's MCP access is on. Nothing for
 * a brain that sends no field.
 */
export function AppDataPills({ app, admin = false }: { app: object; admin?: boolean }) {
  const data = appDataPill(app);
  const mcp = admin ? appMcpPill(app) : null;
  if (!data && !mcp) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {data ? <Pill pill={data} /> : null}
      {mcp ? <Pill pill={mcp} /> : null}
    </span>
  );
}
