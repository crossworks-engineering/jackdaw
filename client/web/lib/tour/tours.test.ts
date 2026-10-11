import { describe, expect, it } from 'vitest';
import { TOURS, tourById } from './tours';

/** One shell for every login (phase W5c): the deployment's tours, for all. */
describe('tourById', () => {
  it('knows the deployment tours by id', () => {
    for (const id of Object.keys(TOURS)) expect(tourById(id)?.id).toBe(id);
  });

  it('knows nothing else, the retired member tour included', () => {
    expect(tourById('member')).toBeNull();
    expect(tourById('nope')).toBeNull();
  });
});
