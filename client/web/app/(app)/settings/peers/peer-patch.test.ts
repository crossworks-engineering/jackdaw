import { describe, expect, it, vi } from 'vitest';
import { revealPatchToken } from './peer-patch';

describe('revealPatchToken', () => {
  it('opens the reveal with the token in the PATCH answer', () => {
    const onRevealNew = vi.fn();
    expect(revealPatchToken({ ok: true, inboundToken: 'mtlpeer_new' }, onRevealNew)).toBe(true);
    expect(onRevealNew).toHaveBeenCalledTimes(1);
    expect(onRevealNew).toHaveBeenCalledWith('mtlpeer_new');
  });

  it('opens no reveal when the answer carries no token', () => {
    const onRevealNew = vi.fn();
    expect(revealPatchToken({ ok: true }, onRevealNew)).toBe(false);
    expect(revealPatchToken({ ok: true, inboundToken: '' }, onRevealNew)).toBe(false);
    expect(revealPatchToken(undefined, onRevealNew)).toBe(false);
    expect(onRevealNew).not.toHaveBeenCalled();
  });
});
