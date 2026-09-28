import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The Team admin screen, pinned where the node test runner cannot render it:
 * the rules themselves are unit-tested in lib/team-requests.test.ts.
 */
const page = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');

describe('Requests: a member login request can be answered', () => {
  it('gates Reply on a login or a contact, not on the contact alone', () => {
    expect(page).toMatch(/\{canReplyToRequest\(selRequest\) \? \(\s*<RequestReply/);
    expect(page).not.toMatch(/selRequest\.contactId \?/);
  });

  it('links "View their chat" through requestChatHref', () => {
    expect(page).toContain('const chatHref = selRequest ? requestChatHref(selRequest) : null;');
    expect(page).toMatch(/\{chatHref \? \(\s*<Link\s+href=\{chatHref\}/);
  });
});

describe('every tab says when its load failed', () => {
  it.each([
    ['members', 'q'],
    ['chats', 'q'],
    ['requests', 'q'],
    ['shares', 'q'],
    ['settings', 'q'],
  ])('%s shows the error with Retry, not Loading for ever', (tab, query) => {
    expect(page).toMatch(new RegExp(`<TabPending active="${tab}" query=\\{${query}\\}`));
  });

  it('shows the bare Loading only inside TabPending', () => {
    expect(page.match(/<Loading \/>/g)).toHaveLength(1);
    expect(page).toMatch(/query\.isError \? \(\s*<LoadError/);
  });
});

describe('the tab strip at phone width', () => {
  it('scrolls sideways with a thin scrollbar', () => {
    expect(page).toMatch(/aria-label="Team admin"\s+className="[^"]*overflow-x-auto[^"]*scrollbar-thin/);
  });
});

describe('Shared links: a revoked link stays gone', () => {
  const panel = readFileSync(
    fileURLToPath(new URL('../../../components/share/shared-links-panel.tsx', import.meta.url)),
    'utf8',
  );

  it('reads its rows from the tab query, not a copy of it', () => {
    expect(panel).not.toMatch(/useState\(initial\)|setRows/);
    expect(page).toContain('queryKey: SHARES_KEY,');
    expect(page).toContain('<SharedLinksPanel rows={q.data.shares} />');
  });

  it('takes the link out of that query and refetches it after a revoke', () => {
    expect(panel).toMatch(/queryClient\.setQueryData<SharesData>\(SHARES_KEY/);
    expect(panel).toContain('void queryClient.invalidateQueries({ queryKey: SHARES_KEY });');
  });
});
