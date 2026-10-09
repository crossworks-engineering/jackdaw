'use client';

import { useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, FolderOpen, Link2, Loader2, Mail, TriangleAlert } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
// Relative, not '@/': the node test runner renders this (client-report.test.ts).
import { kindLabel } from '../../lib/access-levels';
import {
  CLIENT_REPORT_KEY,
  REPORT_CHANGED,
  ackBody,
  ackLine,
  acknowledgeClientReport,
  afterAck,
  isReportChanged,
  linkViewsLine,
  newSinceIds,
  newSinceLine,
  oldLinkAboveLine,
  refLabel,
  sharedLinkHref,
  shownLine,
} from '../../lib/client-report';
import { CLIENT_LOGINS_KEY } from '../../lib/client-logins';
import { HeaderInfoButton, ItemHeader } from '../layout/item-header';
import type { ClientReport, ClientReportItem } from '@mantle/client-types';

/** What the Info button says: why the list is checked first. */
export const REPORT_INTRO =
  'Before anyone is invited as a client, check this list. Every client login will be able to read all of it.';
export const REPORT_STEP =
  'This is the first step for clients: Add client and Issue sign-in link wait for the check.';

/**
 * Settings > Logins > Clients > What clients see (client logins C1; moved out
 * of Team admin 2026-10-09): every item at client level, which every client
 * login will be able to read, checked by an admin before anyone is invited
 * as a client. The screen's query owns the report (CLIENT_REPORT_KEY); this
 * renders it with its one header and sends the acknowledgement.
 */
export function ClientReportPanel({ report }: { report: ClientReport }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [acking, setAcking] = useState(false);
  // After the check the button is gone: focus moves to the line that says
  // who checked it, so the keyboard is not dropped at the top of the page.
  const ackRef = useRef<HTMLParagraphElement>(null);

  const acknowledge = async () => {
    // The whole set by its fingerprint where the brain gives one, else
    // exactly the ids on the screen: the brain records those.
    const body = ackBody(report);
    setAcking(true);
    try {
      const res = await acknowledgeClientReport(body);
      queryClient.setQueryData<ClientReport>(CLIENT_REPORT_KEY, (d) =>
        d ? afterAck(d, res, body) : d,
      );
      void queryClient.invalidateQueries({ queryKey: CLIENT_REPORT_KEY });
      // Add client and Issue sign-in link wait on this check (client logins C2).
      void queryClient.invalidateQueries({ queryKey: CLIENT_LOGINS_KEY });
      toast.success('Marked as checked');
      requestAnimationFrame(() => ackRef.current?.focus());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      if (isReportChanged(e)) {
        // Something went to (or left) client after this list loaded: show
        // the list as it is now, and ask for the check again.
        void queryClient.invalidateQueries({ queryKey: CLIENT_REPORT_KEY });
        toast.error(REPORT_CHANGED);
        return;
      }
      toast.error(e instanceof Error && e.message ? e.message : 'Could not record the check');
    } finally {
      setAcking(false);
    }
  };

  return (
    <ClientReportView
      report={report}
      acking={acking}
      onAck={() => void acknowledge()}
      ackRef={ackRef}
    />
  );
}

/** The report itself: no state, no requests (the tests render it). */
export function ClientReportView({
  report,
  acking,
  onAck,
  ackRef,
}: {
  report: ClientReport;
  acking: boolean;
  onAck: () => void;
  /** The acknowledgement line, focused after the check. */
  ackRef?: RefObject<HTMLParagraphElement | null>;
}) {
  const ack = report.acknowledgement;
  const newCount = report.newSinceAck.length;
  const newIds = newSinceIds(report);
  const cut = shownLine(report);
  return (
    <>
      {/* The pane's one header (ItemHeader): the title and count, the check
          as its text action, the intro behind Info. */}
      <ItemHeader
        sticky
        visual={<Eye className="size-4 text-primary-ink" aria-hidden />}
        title="What clients see"
        badges={
          <span
            className="text-xs font-normal text-muted-foreground"
            aria-label={`${report.total} client ${report.total === 1 ? 'item' : 'items'}`}
          >
            {report.total}
          </span>
        }
        textActions={
          report.acknowledged ? null : (
            <Button size="sm" disabled={acking} onClick={onAck}>
              {acking ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 aria-hidden />
              )}
              I have checked this list
            </Button>
          )
        }
        iconActions={
          <HeaderInfoButton label="About this list">
            <p>{REPORT_INTRO}</p>
            <p className="text-muted-foreground">{REPORT_STEP}</p>
          </HeaderInfoButton>
        }
      />
      <div className="w-full space-y-4 p-4">
        <div className="space-y-2">
          <p
            ref={ackRef}
            tabIndex={-1}
            className="text-sm outline-none"
            data-testid="client-report-ack"
          >
            {ack ? ackLine(ack) : 'Nobody has checked this list yet.'}
          </p>
          {ack && newCount > 0 ? (
            <p role="status" className="flex items-start gap-1.5 text-xs text-warning-ink">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {newSinceLine(report)}
            </p>
          ) : null}
        </div>

        {report.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <p>No item is at client level.</p>
            <p className="mt-1">
              Nothing is on the list, so a client login would read nothing yet. Anything you set to
              Client later shows here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Client-level items">
            {report.items.map((item) => (
              <ClientReportRow key={item.id} item={item} isNew={newIds.has(item.id)} />
            ))}
          </ul>
        )}
        {cut ? <p className="text-xs text-muted-foreground">{cut}</p> : null}
      </div>
    </>
  );
}

function ClientReportRow({ item, isNew }: { item: ClientReportItem; isNew: boolean }) {
  return (
    <li className="min-w-0 space-y-1.5 rounded-lg border border-border bg-card/70 p-3 text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <Link
          href={`/n/${item.id}`}
          className="min-w-0 break-words text-sm font-medium underline-offset-2 hover:underline"
        >
          {item.title || 'Untitled'}
        </Link>
        <span className="shrink-0 text-xs text-muted-foreground">
          {isNew ? (
            <span className="mr-1.5 font-medium text-warning-ink">New since checked</span>
          ) : null}
          {kindLabel(item.type)} · updated {formatDate(item.updatedAt)}
        </span>
      </div>
      {item.link ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Link2 className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Old open link: {linkViewsLine(item.link)}</span>
        </p>
      ) : null}
      {(item.oldLinksAbove ?? []).map((l) => (
        <p
          key={l.shareId}
          className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink"
        >
          <FolderOpen className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {oldLinkAboveLine(l)}: anyone with that link can open it.{' '}
            <Link href={sharedLinkHref(l.shareId)} className="underline underline-offset-2">
              Open in Shared links
            </Link>
          </span>
        </p>
      ))}
      {item.emailedTo.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Mail className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-all">
            Emailed to {item.emailedTo.join(', ')}. Worth inviting as clients?
          </span>
        </p>
      ) : null}
      {item.refsAbove.length > 0 ? (
        <p
          role="note"
          className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink"
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            Names {item.refsAbove.length === 1 ? 'an item' : `${item.refsAbove.length} items`}{' '}
            clients cannot read: {item.refsAbove.map(refLabel).join(', ')}. Clients may see{' '}
            {item.refsAbove.length === 1 ? 'its title' : 'their titles'}.
          </span>
        </p>
      ) : null}
    </li>
  );
}
