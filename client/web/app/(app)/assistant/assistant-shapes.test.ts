import { describe, expect, it } from 'vitest';
import { switchableShapes } from './assistant-shapes';

const labels = (d: Parameters<typeof switchableShapes>[0]) =>
  switchableShapes(d).map((s) => s.label);

describe('switchableShapes', () => {
  it('offers only the shapes you can switch to', () => {
    expect(labels('docked')).toEqual(['Window', 'Full']);
    expect(labels('popout')).toEqual(['Side', 'Full']);
    expect(labels('full')).toEqual(['Side', 'Window']);
  });
});
