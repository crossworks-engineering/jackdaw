'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mantle/web-ui/ui/card';
import { GapAnswerForm } from '@/components/journal/gap-answer';
import type { JournalRow } from '@mantle/client-types';

const SHOW = 3;

type JournalListResponse = { journals: JournalRow[]; total: number };

/**
 * "Questions for you" — the gap loop's front door. Open `gap` journal entries
 * are knowledge the agents asked for and could not find; answering one here
 * resolves it and turns the answer into shared context every agent carries.
 * Renders nothing when there are no open questions (most days), so the
 * dashboard stays quiet unless the brain actually needs something.
 */
export function OpenQuestions() {
  const queryClient = useQueryClient();
  const gapsQuery = useQuery({
    queryKey: ['journal', 'open-gaps'],
    queryFn: () => apiFetch<JournalListResponse>('/api/journal?kind=gap&status=open'),
  });

  const gaps = gapsQuery.data?.journals ?? [];
  // Quiet by default: no card while loading, on error (the dashboard body
  // already surfaces brain-unreachable), or with nothing to answer.
  if (gaps.length === 0) return null;
  const total = gapsQuery.data?.total ?? gaps.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="size-4 text-primary-ink" aria-hidden />
          Questions for you
        </CardTitle>
        <CardDescription>
          Your agents hit gaps they couldn’t fill. Each answer becomes shared knowledge every agent
          carries from now on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {gaps.slice(0, SHOW).map((gap) => (
          <div key={gap.id} className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-2 text-sm font-medium">{gap.body || gap.title}</p>
            <GapAnswerForm
              gap={gap}
              compact
              onResolved={() => void queryClient.invalidateQueries({ queryKey: ['journal'] })}
            />
          </div>
        ))}
        {total > SHOW && (
          <Link
            href="/journal?view=questions"
            className="block text-sm text-primary-ink underline-offset-2 hover:underline"
          >
            All {total} open questions →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
