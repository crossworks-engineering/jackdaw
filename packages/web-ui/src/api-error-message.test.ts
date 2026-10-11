import { describe, expect, it } from 'vitest';
import { errorMessageOf } from './api-fetch';

const res = { status: 403, statusText: 'Forbidden' };

describe('errorMessageOf (workspaces W6b)', () => {
  it('shows the brain message of a session guard refusal', () => {
    expect(
      errorMessageOf(
        {
          error: 'forbidden',
          reason: 'item-workspace',
          message: 'This item is in a workspace you are not in. Add yourself to it first.',
        },
        res,
      ),
    ).toBe('This item is in a workspace you are not in. Add yourself to it first.');
    expect(
      errorMessageOf(
        { error: 'forbidden', reason: 'workspace', message: 'You are not in that workspace.' },
        res,
      ),
    ).toBe('You are not in that workspace.');
  });

  it('keeps the error text of every other body', () => {
    expect(errorMessageOf({ error: 'Title is required.' }, { ...res, status: 400 })).toBe(
      'Title is required.',
    );
    expect(errorMessageOf({ error: 'forbidden' }, res)).toBe('forbidden');
    expect(errorMessageOf({ error: 'gone', message: 'x' }, { ...res, status: 410 })).toBe('gone');
    expect(errorMessageOf({}, { status: 500, statusText: 'Server Error' })).toBe(
      '500 Server Error',
    );
  });
});
