import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaStateProvider } from '../media-state-provider';

// Mock the player registry
vi.mock('../../../media/player-registry', () => {
  const players: unknown[] = [];
  return {
    getPlayerRegistry: () => ({
      getAll: () => players,
      refresh: () => players,
      dispose: () => { players.length = 0; },
    }),
    __setPlayers: (p: unknown[]) => { players.length = 0; players.push(...p); },
  };
});

function makeFakePlayer(id: string, overrides: Record<string, unknown> = {}) {
  const videoEl = document.createElement('video');
  return {
    id,
    platform: 'native' as const,
    capabilities: {
      play: true, pause: true, seek: true, setVolume: true,
      mute: true, unmute: true, getState: true,
      nextTrack: false, previousTrack: false, shuffle: false,
    },
    anchorElement: videoEl,
    getState: vi.fn(async () => ({
      currentTime: 10, duration: 60, paused: false, volume: 1,
      muted: false, playbackRate: 1, title: 'Test Video',
      platform: 'native' as const, hasPlaylist: false,
      ...overrides,
    })),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    mute: vi.fn(async () => {}),
    unmute: vi.fn(async () => {}),
    isAlive: () => true,
    dispose: () => {},
  };
}

describe('MediaStateProvider', () => {
  let provider: MediaStateProvider;

  beforeEach(() => {
    provider = new MediaStateProvider();
  });

  it('has category media', () => {
    expect(provider.category).toBe('media');
  });

  it('collect returns cached values', () => {
    const result = provider.collect(document);
    expect(Array.isArray(result)).toBe(true);
  });

  it('refreshAsync populates cache with fullscreen and captions fields', async () => {
    const { __setPlayers } = await import('../../../media/player-registry') as unknown as {
      __setPlayers: (p: unknown[]) => void;
    };
    const player = makeFakePlayer('test-0');
    __setPlayers([player]);

    await provider.refreshAsync(document);
    const result = provider.collect(document);

    expect(result).toHaveLength(1);
    expect(result[0].fullscreen).toBe(false);
    expect(result[0].captions).toBe(false);
    expect(result[0].playerId).toBe('test-0');
    expect(result[0].duration).toBe(60);
    expect(result[0].muted).toBe(false);
  });

  it('dispose clears cache', () => {
    provider.dispose();
    const result = provider.collect(document);
    expect(result).toEqual([]);
  });
});
