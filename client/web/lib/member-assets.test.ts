import { describe, expect, it } from 'vitest';
import { memberAssetPath } from './member-assets';

const ID = '11111111-2222-4333-8444-555555555555';

describe('memberAssetPath', () => {
  it('maps admin file and drawing paths onto the member routes', () => {
    expect(memberAssetPath(`/api/files/files/${ID}?raw=1`)).toBe(`/api/member/files/${ID}`);
    expect(memberAssetPath(`/api/files/files/${ID}`)).toBe(`/api/member/files/${ID}`);
    expect(memberAssetPath(`/api/draws/${ID}/svg?raw=1`)).toBe(`/api/member/draws/${ID}/svg`);
  });

  it('leaves anything else alone', () => {
    expect(memberAssetPath('/api/appearance/logo')).toBe('/api/appearance/logo');
    expect(memberAssetPath(`/api/files/files/${ID}/extra`)).toBe(`/api/files/files/${ID}/extra`);
  });
});
