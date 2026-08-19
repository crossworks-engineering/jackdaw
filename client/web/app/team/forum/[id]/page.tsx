import type { Metadata } from 'next';
import { MeasurePane } from '@mantle/web-ui/ui/measure-pane';
import { TopicViewClient } from '@/components/team-forum/topic-view-client';

export const metadata: Metadata = { title: 'Team · Forum' };

// One forum topic — the DEEP LINK. In-app navigation now opens topics inline
// beside the list (/team/forum?t=<id>), but this route stays alive: the
// agent's own links, notification mail, and copied URLs point here (style
// guide §8, "keep deep links working"). `?turn=<id>` carries an in-flight
// turn from "New topic" so the view attaches to the live stream instead of
// waiting for a refetch.
//
// A route holding one column of prose and nothing else gets `<MeasurePane>`:
// the thread opens readable and the reader's own handle sets the measure,
// with no ceiling.
export default async function TeamForumTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ turn?: string }>;
}) {
  const { id } = await params;
  const { turn } = await searchParams;
  return (
    <div className="min-h-0 flex-1">
      <MeasurePane id="team-forum-topic" defaultSize="900px">
        <TopicViewClient topicId={id} initialTurnId={turn} />
      </MeasurePane>
    </div>
  );
}
