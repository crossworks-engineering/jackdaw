import { describe, expect, it } from 'vitest';
import { studioParamsPatch } from './studio-params';

describe('studioParamsPatch', () => {
  const saved = { temperature: 0.7, max_tokens: 2000, tool_loading: 'deferred', top_p: 0.9 };

  it('keeps every saved key the editor does not show', () => {
    expect(studioParamsPatch(saved, '0.3', '4000')).toEqual({
      temperature: 0.3,
      max_tokens: 4000,
      tool_loading: 'deferred',
      top_p: 0.9,
    });
  });

  it('a blank field removes its key, the rest stay', () => {
    expect(studioParamsPatch(saved, '', '')).toEqual({ tool_loading: 'deferred', top_p: 0.9 });
  });

  it('works with nothing saved', () => {
    expect(studioParamsPatch(null, '1', '')).toEqual({ temperature: 1 });
  });
});
