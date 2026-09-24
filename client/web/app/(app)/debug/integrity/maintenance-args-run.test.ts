import { describe, expect, it } from 'vitest';
import { lastReviewPageId } from './maintenance-args-run';

describe('lastReviewPageId', () => {
  it('takes the page id the last preview printed', () => {
    const lines = [
      '$ tsx scripts/journal-rules-reconcile.ts --agent=assistant  (dry-run)',
      '23 live learned rules; 9 close pairs',
      '1 rule(s) to retire; review page: 62e1f106-00b2-4ea3-8097-e76eb32cd67e',
      'apply with:  pnpm maintain journal-rules-reconcile --apply --page=62e1f106-00b2-4ea3-8097-e76eb32cd67e --yes',
    ];
    expect(lastReviewPageId(lines)).toBe('62e1f106-00b2-4ea3-8097-e76eb32cd67e');
  });

  it('is empty when no review page was printed', () => {
    expect(lastReviewPageId(['done'])).toBe('');
    expect(lastReviewPageId(undefined)).toBe('');
  });
});
