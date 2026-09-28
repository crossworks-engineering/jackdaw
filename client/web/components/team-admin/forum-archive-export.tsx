'use client';

/**
 * The Topics tab's banner (member logins, Phase 6): the forum is closed, and
 * its topics become admin-level pages under one "Forum archive" page.
 * GET /api/team-admin/forum/export counts the topics with no page yet; the
 * button POSTs the export (idempotent, so a second press only picks up what
 * is left) and the banner keeps what the run did, with a link to the archive.
 * A brain without the export route (GET fails) shows the closed line alone.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Info, Loader2 } from 'lucide-react';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  EXPORT_BUSY_TEXT,
  FORUM_CLOSED_TEXT,
  exportResultText,
  isExportBusy,
  unexportedText,
  type ForumExportCount,
  type ForumExportResult,
} from '@/lib/forum-closed';

const EXPORT_PATH = '/api/team-admin/forum/export';

export function ForumArchiveBanner() {
  const toast = useToast();
  const count = useQuery({
    queryKey: ['team-admin', 'forum-export'],
    queryFn: () => apiFetch<ForumExportCount>(EXPORT_PATH),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ForumExportResult | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setResult(await apiSend<ForumExportResult>(EXPORT_PATH, 'POST'));
    } catch (err) {
      toast.error(
        err instanceof ApiError && isExportBusy(err.status, err.body)
          ? EXPORT_BUSY_TEXT
          : err instanceof ApiError
            ? err.message
            : 'Could not reach the server. Try again.',
      );
    } finally {
      setBusy(false);
      void count.refetch();
    }
  };

  return (
    <div
      role="note"
      className="flex shrink-0 flex-col gap-2 border-b border-border bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium">{FORUM_CLOSED_TEXT}</span>
        {count.data && (
          <>
            <span className="text-muted-foreground">{unexportedText(count.data.unexported)}</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FileText />}
              Export to Pages
            </Button>
          </>
        )}
      </div>
      {result && (
        <p className="text-muted-foreground">
          {exportResultText(result)}
          {result.archivePageId && (
            <>
              {' '}
              <Link
                href={`/pages/${result.archivePageId}`}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Open the Forum archive
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
