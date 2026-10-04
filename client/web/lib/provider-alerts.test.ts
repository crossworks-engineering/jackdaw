import { describe, expect, it } from 'vitest';
import type { NeedsYou } from '@mantle/client-types';
import {
  alertFix,
  alertHeadline,
  alertHref,
  alertImpact,
  nextTryText,
  providerAlertsOf,
  type ProviderAlert,
} from './provider-alerts';
import { arrivalText, arrivals, needsYouLabel, totalWaiting } from './needs-you';

const NOW = new Date('2026-10-04T10:00:00');

const outage = (over: Partial<ProviderAlert> = {}): ProviderAlert => ({
  subject: 'embedding',
  code: 'quota',
  permanent: true,
  reason: 'The provider account has no credits or quota left.',
  provider: 'openai',
  model: 'text-embedding-3-large',
  since: new Date('2026-10-04T08:14:00').toISOString(),
  paused: true,
  nextProbeAt: new Date('2026-10-04T10:20:00').toISOString(),
  waiting: 30,
  ...over,
});

const ny = (providers?: ProviderAlert[]): NeedsYou =>
  ({
    review: { submitted: 0, leftBehind: 0, newest: null },
    requests: { open: 0, newest: null },
    total: providers?.length ?? 0,
    ...(providers ? { providers } : {}),
  }) as NeedsYou;

describe('provider alert words (the 2026-10-04 no-credits case)', () => {
  it('says what fails, since when, why, what it does, and how many wait', () => {
    const a = outage();
    expect(alertHeadline(a, NOW)).toMatch(
      // The time is in the viewer's locale (08:14, or 08:14 AM).
      /^Embeddings are failing since \d{1,2}:\d\d(?:\s?[AP]M)?: The provider account has no credits or quota left\.$/,
    );
    expect(alertImpact(a)).toBe(
      'New files are not indexed and search has less context. 30 items wait.',
    );
    expect(alertImpact(outage({ waiting: 1 }))).toMatch(/1 item waits\.$/);
    expect(alertImpact(outage({ waiting: null }))).not.toMatch(/wait/);
  });

  it('gives the fix by error code, and where', () => {
    expect(alertFix(outage())).toMatch(/Add credits to the OpenAI account/);
    expect(alertFix(outage({ code: 'auth' }))).toMatch(/Check the API key in Settings, Keys/);
    expect(alertFix(outage({ code: 'model' }))).toMatch(/Pick a model/);
    expect(alertFix(outage({ code: 'server', permanent: false }))).toMatch(/retries by itself/);
    expect(alertHref(outage())).toBe('/settings/embedding');
    expect(alertHref(outage({ subject: 'extraction' }))).toBe('/settings/ai-workers');
  });

  it('says when the brain tries again', () => {
    expect(nextTryText(outage(), NOW)).toBe('The brain tries again in 20 min.');
    expect(nextTryText(outage({ nextProbeAt: null }), NOW)).toBeNull();
  });
});

describe('provider alerts in "Needs you"', () => {
  it('a brain before 0230 sends none', () => {
    expect(providerAlertsOf(ny())).toEqual([]);
    expect(providerAlertsOf(null)).toEqual([]);
  });

  it('count toward the total but not the people-work label', () => {
    const n = ny([outage()]);
    expect(totalWaiting(n)).toBe(1);
    expect(needsYouLabel(n)).toBeNull();
  });

  it('a new outage arrives once, with words and a link to the fix', () => {
    const before = ny();
    const after = ny([outage()]);
    const fresh = arrivals(before, after);
    expect(fresh.map((a) => a.kind)).toEqual(['provider']);
    expect(arrivalText(fresh[0]!)).toMatchObject({
      title: 'Embeddings are failing',
      href: '/settings/embedding',
    });
    expect(arrivals(after, after)).toEqual([]);
    expect(arrivals(null, after)).toEqual([]);
  });
});
