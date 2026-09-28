import { describe, expect, it } from 'vitest';
import { browserPermission, mayNotify } from './needs-you-browser-notify';

describe('browser notifications for needs-you', () => {
  it('shows one only when opted in AND allowed', () => {
    expect(mayNotify(true, 'granted')).toBe(true);
    expect(mayNotify(false, 'granted')).toBe(false);
    expect(mayNotify(true, 'default')).toBe(false);
    expect(mayNotify(true, 'denied')).toBe(false);
    expect(mayNotify(true, 'unsupported')).toBe(false);
  });
  it('has nothing to ask where there is no Notification (the server)', () => {
    expect(browserPermission()).toBe('unsupported');
  });
});
