import { describe, expect, it } from 'vitest';
import {
  alertFix,
  alertHeadline,
  alertHref,
  alertImpact,
  nextTryText,
  providerAlertsOf,
  type ProviderAlert,
} from './provider-alerts';

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

describe('provider alerts on GET /api/embedding/recover', () => {
  it('reads the alerts the brain sends', () => {
    const a = outage();
    expect(providerAlertsOf({ alerts: [a] })).toEqual([a]);
  });

  it('a brain before 0230, or no answer, sends none', () => {
    expect(providerAlertsOf({})).toEqual([]);
    expect(providerAlertsOf({ alerts: 'x' })).toEqual([]);
    expect(providerAlertsOf(null)).toEqual([]);
    expect(providerAlertsOf(undefined)).toEqual([]);
  });
});
