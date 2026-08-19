import { describe, expect, it } from 'vitest';
import { mediaNodeId, teamMediaPath } from './team-media';

/**
 * `![alt](media:<node-id>)` is how a reply places a stored picture in the
 * sentence it belongs to. The member surfaces render standard Markdown, so this
 * marker is the ONE thing they resolve beyond it — and a marker a model writes
 * is a marker a model can get wrong.
 */
describe('mediaNodeId', () => {
  const ID = '0f9b1c2d-3e4f-4a5b-8c7d-9e0f1a2b3c4d';

  it('reads the node id out of a media marker', () => {
    expect(mediaNodeId(`media:${ID}`)).toBe(ID);
  });

  it('tolerates padding the model left in', () => {
    expect(mediaNodeId(`media: ${ID} `)).toBe(ID);
  });

  it('ignores an ordinary image src, so a real URL still renders', () => {
    expect(mediaNodeId('https://example.com/chart.png')).toBeNull();
    expect(mediaNodeId('/api/team/forum/media/x')).toBeNull();
  });

  it('rejects a malformed id rather than turning it into a request', () => {
    expect(mediaNodeId('media:not-a-uuid')).toBeNull();
    expect(mediaNodeId('media:')).toBeNull();
    // Path traversal is the one that matters: it must not reach the route.
    expect(mediaNodeId('media:../../api/files/files/secret')).toBeNull();
  });

  it('handles absent srcs', () => {
    expect(mediaNodeId(undefined)).toBeNull();
    expect(mediaNodeId(null)).toBeNull();
  });
});

describe('teamMediaPath', () => {
  it('routes each surface to its own authorization', () => {
    expect(teamMediaPath('forum', 'n1')).toBe('/api/team/forum/media/n1');
    expect(teamMediaPath('messages', 'n1')).toBe('/api/team/messages/media/n1');
  });
});
