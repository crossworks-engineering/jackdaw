'use client';

/**
 * Team > Settings: let members chat with the team agent. A member login chats
 * only with a Team-level agent, and the team agent ships at Admin level, so
 * this card is the one step that opens member chat. It sets the level through
 * PATCH /api/access/agents/:slug, after a confirm that says what members then
 * reach. `TeamAgentNotice` is the Invites tab's pointer to it.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
import { LEVEL_LABEL } from '@/lib/access-levels';
import {
  CLOSE_TEAM_CHAT_BODY,
  OPEN_TEAM_CHAT_BODY,
  openedMessage,
  teamAgentPath,
  teamAgentState,
  type TeamAgentAccess,
} from '@/lib/team-agent-access';

const SETTINGS_KEY = ['team-admin', 'settings'] as const;
/** The shipped slug: used on a brain that does not report the agent. */
const DEFAULT_SLUG = 'team-responder';

export function TeamAgentAccessCard({ agent }: { agent: TeamAgentAccess | null | undefined }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<'open' | 'close' | null>(null);
  const [pending, setPending] = useState(false);
  const state = teamAgentState(agent);
  const name = agent?.name ?? 'the team agent';

  const apply = async (which: 'open' | 'close') => {
    setPending(true);
    try {
      const res = await apiSend<{ agent?: { removedGroups?: string[] } }>(
        teamAgentPath(agent?.slug ?? DEFAULT_SLUG),
        'PATCH',
        which === 'open' ? OPEN_TEAM_CHAT_BODY : CLOSE_TEAM_CHAT_BODY,
      );
      toast.success(
        which === 'open'
          ? openedMessage(name, res.agent?.removedGroups ?? [])
          : `Members can no longer chat with ${name}.`,
      );
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not change the level.');
    } finally {
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-sm font-semibold">Member chat</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        Members chat with the team agent. It must be at Team level first.
      </p>
      {state === 'missing' ? (
        <p className="text-sm text-muted-foreground">
          This brain has no team agent, so members cannot chat.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm">
            {state === 'on' ? (
              <>
                <span className="font-medium text-success-ink">On.</span> Members can chat with{' '}
                {name}.
              </>
            ) : state === 'off' ? (
              <>
                <span className="font-medium text-warning-ink">Off.</span> {name} is at{' '}
                {LEVEL_LABEL[agent!.audience]} level, so members cannot chat with it.
              </>
            ) : (
              <>This brain does not report the team agent&apos;s level.</>
            )}
          </p>
          {state === 'on' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm('close')}
            >
              Stop member chat
            </Button>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => setConfirm('open')}>
              Let members chat
            </Button>
          )}
        </div>
      )}
      {agent && !agent.enabled ? (
        <p className="mt-2 text-xs text-warning-ink">
          {name} is turned off. Turn it on in Settings, Agents, or members cannot chat.
        </p>
      ) : null}

      <AlertDialog open={confirm === 'open'} onOpenChange={(o) => setConfirm(o ? 'open' : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let members chat with {name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{name} moves to Team level. Then:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Every member login can chat with it, each in their own thread.</li>
                  <li>
                    It answers from items at Team level or lower. Admin items stay out. Your email
                    and journal stay out unless Expose email &amp; journal is on.
                  </li>
                  <li>
                    Tool groups above Team level leave it. They do not come back if you stop member
                    chat.
                  </li>
                  <li>Members cannot change your brain. A change they ask for comes to you.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void apply('open')}>
              Let members chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === 'close'} onOpenChange={(o) => setConfirm(o ? 'close' : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop member chat?</AlertDialogTitle>
            <AlertDialogDescription>
              {name} goes back to Admin level. Members can no longer chat with it. Their past
              threads stay, and you can still read them in Member chats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void apply('close')}>
              Stop member chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** On the Invites tab: says when an invited member could not chat yet, and
 *  links to the card above. Nothing when chat is on, or the brain cannot say. */
export function TeamAgentNotice({ agent }: { agent: TeamAgentAccess | null | undefined }) {
  const state = teamAgentState(agent);
  if (state !== 'off' && state !== 'missing') return null;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
      <p>
        {state === 'missing'
          ? 'Members cannot chat: this brain has no team agent.'
          : 'Members cannot chat yet: the team agent is not at Team level.'}{' '}
        <Link
          href="/team-admin?view=settings"
          className="font-medium text-primary-ink underline underline-offset-2"
        >
          Open Settings
        </Link>
      </p>
    </div>
  );
}
