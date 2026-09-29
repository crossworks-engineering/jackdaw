'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, Link2, Loader2, Mail, TriangleAlert } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
// Relative, not '@/': the node test runner renders this (client-report.test.ts).
import { kindLabel } from '../../lib/access-levels';
import {
  CLIENT_REPORT_KEY,
  ackLine,
  acknowledgeClientReport,
  afterAck,
  linkViewsLine,
  newSinceLine,
  refLabel,
  shownIds,
  shownLine,
} from '../../lib/client-report';
import { CLIENT_LOGINS_KEY } from '../../lib/client-logins';
import type { ClientReport, ClientReportItem } from '@mantle/client-types';

/**
 * Team admin > What clients see (client logins C1): every item at client
 * level, which every client login will be able to read, checked by an admin
 * before anyone is invited as a client. The tab's query owns the report
 * (CLIENT_REPORT_KEY); this renders it and sends the acknowledgement.
 */
export function ClientReportPanel({ report }: { report: ClientReport }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [acking, setAcking] = useState(false);

  const acknowledge = async () => {
    // Exactly what is on the screen: the brain records those ids.
    const ids = shownIds(report);
    setAcking(true);
    try {
      const res = await acknowledgeClientReport(ids);
      queryClient.setQueryData<ClientReport>(CLIENT_REPORT_KEY, (d) =>
        d ? afterAck(d, res, ids) : d,
      );
      void queryClient.invalidateQueries({ queryKey: CLIENT_REPORT_KEY });
      // Team admin > Clients waits on this check (client logins C2).
      void queryClient.invalidateQueries({ queryKey: CLIENT_LOGINS_KEY });
      toast.success('Marked as checked');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error && e.message ? e.message : 'Could not record the check');
    } finally {
      setAcking(false);
    }
  };

  return <ClientReportView report={report} acking={acking} onAck={() => void acknowledge()} />;
}

/** The report itself: no state, no requests (the tests render it). */
export function ClientReportView({
  report,
  acking,
  onAck,
}: {
  report: ClientReport;
  acking: boolean;
  onAck: () => void;
}) {
  const ack = report.acknowledgement;
  const newCount = report.newSinceAck.length;
  const cut = shownLine(report);
  return (
    <div className="w-full space-y-4 p-4">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
        <div className="flex items-baseline gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="size-4 text-primary-ink" aria-hidden />
            What clients see
          </h2>
          <span className="text-xs text-muted-foreground">{report.total}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Before anyone is invited as a client, check this list. Every client login will be able to
          read all of it.
        </p>
        <p className="text-xs" data-testid="client-report-ack">
          {ack ? ackLine(ack) : 'Nobody has checked this list yet.'}
        </p>
        {ack && newCount > 0 ? (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink"
          >
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {newSinceLine(newCount)}
          </p>
        ) : null}
        {report.acknowledged ? null : (
          <Button size="sm" disabled={acking} onClick={onAck}>
            {acking ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 aria-hidden />
            )}
            I have checked this list
          </Button>
        )}
      </section>

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
            <ClientReportRow
              key={item.id}
              item={item}
              isNew={report.newSinceAck.includes(item.id)}
            />
          ))}
        </ul>
      )}
      {cut ? <p className="text-xs text-muted-foreground">{cut}</p> : null}
    </div>
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
