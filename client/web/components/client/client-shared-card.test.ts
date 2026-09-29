import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientSharedRow } from '@mantle/client-types';
import { ClientSharedCard } from './client-shared-card';

/**
 * "Shared with you" never shows a summary (client logins audit B1): the brain
 * wrote it from the item's UNREDACTED text, so it could name what the body
 * calls "Private item". A brain before the fix still sends one.
 */
const SUMMARY = 'Mentions the team page Price floor 2027';
const row: ClientSharedRow = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'page',
  title: 'Proposal',
  icon: null,
  summary: SUMMARY,
  updatedAt: '2026-09-28T08:00:00.000Z',
};

describe('ClientSharedCard', () => {
  it('shows the title and kind, and no summary even when one is sent', () => {
    const html = renderToStaticMarkup(
      createElement(ClientSharedCard, { row, selected: false, onOpen: () => {} }),
    );
    expect(html).toContain('Proposal');
    expect(html).toContain('Page');
    expect(html).not.toContain(SUMMARY);
    expect(html).not.toContain('Price floor');
  });
});

describe('no client component reads a summary', () => {
  it('nothing under components/client names `.summary`', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    expect(files).toEqual(expect.arrayContaining(['client-home.tsx', 'client-reader.tsx']));
    for (const f of files) {
      const src = readFileSync(`${dir}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/\.summary\b/);
    }
  });
});
