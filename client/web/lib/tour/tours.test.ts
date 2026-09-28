import { describe, expect, it } from 'vitest';
import { MEMBER_NAV } from '../member-nav';
import { MEMBER_TOUR_ID, memberTourById, tourById, toursFor } from './tours';

const memberHrefs = MEMBER_NAV.flatMap((g) => g.items.map((i) => i.href));

describe('toursFor', () => {
  it('a member knows only the member tour, and it opens by itself', () => {
    const t = toursFor('member', 'demo');
    expect(t.autoTour).toBe(MEMBER_TOUR_ID);
    expect(t.byId(MEMBER_TOUR_ID)?.id).toBe(MEMBER_TOUR_ID);
    // The deployment's tour walks admin screens: for a member it is no tour,
    // so a ?tour=demo link starts nothing instead of an invisible trap.
    expect(t.byId('demo')).toBeNull();
  });

  it("an admin keeps the deployment's tour and never gets the member tour", () => {
    const t = toursFor('admin', 'demo');
    expect(t.autoTour).toBe('demo');
    expect(t.byId('demo')?.id).toBe('demo');
    expect(t.byId(MEMBER_TOUR_ID)).toBeNull();
    expect(toursFor('admin', '').autoTour).toBe('');
  });
});

describe('the member tour', () => {
  const tour = memberTourById(MEMBER_TOUR_ID)!;

  it('exists and is not an admin tour', () => {
    expect(tour.steps.length).toBeGreaterThan(3);
    expect(tourById(MEMBER_TOUR_ID)).toBeNull();
  });

  it('starts on the member home, where it opens by itself', () => {
    expect(tour.steps[0]!.route).toBe('/');
  });

  it('only visits screens a member may open', () => {
    const allowed = new Set(memberHrefs.filter((h) => h.startsWith('/')));
    for (const step of tour.steps) expect(allowed).toContain(step.route);
  });

  it('only points at targets the member shell renders', () => {
    const targets = new Set([
      'brand',
      'main',
      'profile',
      'member-sources',
      ...memberHrefs.map((h) => `nav:${h}`),
    ]);
    for (const step of tour.steps) if (step.target) expect(targets).toContain(step.target);
  });

  it('keeps each card short: two sentences at most', () => {
    for (const step of tour.steps) {
      const sentences = step.body.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });
});
