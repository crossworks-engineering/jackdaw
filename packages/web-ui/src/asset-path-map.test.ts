import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetTokenVersion, assetUrl, setAssetPathMap, subscribeAssetToken } from './asset-url';

afterEach(() => setAssetPathMap(null));

describe('the asset path map (workspaces W6b)', () => {
  it('maps a path before it is resolved', () => {
    expect(assetUrl('/api/files/files/x?raw=1')).toBe('/api/files/files/x?raw=1');
    setAssetPathMap((p) => p.replace('/api/files/files/', '/api/member/files/'));
    expect(assetUrl('/api/files/files/x?raw=1')).toBe('/api/member/files/x?raw=1');
  });

  it('tells the URL readers, unless asked not to', () => {
    const heard = vi.fn();
    const off = subscribeAssetToken(heard);
    const before = assetTokenVersion();
    const map = (p: string) => p;
    setAssetPathMap(map, { notify: false });
    expect(heard).not.toHaveBeenCalled();
    expect(assetTokenVersion()).toBe(before + 1);
    setAssetPathMap(map);
    expect(heard).not.toHaveBeenCalled();
    setAssetPathMap(null);
    expect(heard).toHaveBeenCalledTimes(1);
    off();
  });
});
