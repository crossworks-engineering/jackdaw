'use client';

import Link from 'next/link';
import { cn } from '@mantle/web-ui/lib/utils';
import { PURPOSE_MAX_CHARS, type PurposeCheck } from '@/lib/purpose-input';

/**
 * The line under a purpose textarea: a live `n / 600` counter, the error when
 * the text is over the limit, and a hint when the text reads like an assistant
 * persona prompt (which belongs in Agent Studio, not here).
 *
 * `inWizard` words the hint for onboarding, where the personality is the next
 * step and there is no app to link to yet.
 */
export function PurposeFieldNote({
  id,
  check,
  inWizard = false,
}: {
  /** Put this on the textarea's `aria-describedby`. */
  id: string;
  check: PurposeCheck;
  inWizard?: boolean;
}) {
  const overBy = check.length - PURPOSE_MAX_CHARS;
  return (
    <div id={id} className="space-y-2">
      <div className="flex items-start justify-between gap-3 text-xs">
        <p className={check.over ? 'text-destructive-ink' : 'text-muted-foreground'}>
          {check.over
            ? `Too long by ${overBy.toLocaleString('en-US')} characters. Keep it to one or two sentences on what this brain is for.`
            : 'One or two sentences on what this brain is for.'}
        </p>
        <span
          aria-live="polite"
          className={cn(
            'shrink-0 tabular-nums',
            check.over ? 'font-medium text-destructive-ink' : 'text-muted-foreground',
          )}
        >
          {check.length.toLocaleString('en-US')} / {PURPOSE_MAX_CHARS}
        </span>
      </div>
      {check.looksLikePersona && (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning-ink">
          This reads like an assistant personality prompt. This field is not the assistant&apos;s
          personality.{' '}
          {inWizard ? (
            <>
              Pick a personality on the next step. After setup, edit the assistant&apos;s full
              prompt in Agent Studio or Settings → Agents.
            </>
          ) : (
            <>
              Edit the assistant&apos;s prompt in{' '}
              <Link href="/studio" className="underline underline-offset-2">
                Agent Studio
              </Link>{' '}
              or{' '}
              <Link href="/settings/agents" className="underline underline-offset-2">
                Settings → Agents
              </Link>
              .
            </>
          )}
        </p>
      )}
    </div>
  );
}
