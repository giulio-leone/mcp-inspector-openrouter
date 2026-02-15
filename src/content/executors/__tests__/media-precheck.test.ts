import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '../../../types';
import type { MediaLiveState, LiveStateSnapshot } from '../../../types/live-state.types';
import * as liveStateModule from '../../live-state';
import { getPlayerRegistry, type IVideoPlayer } from '../../media';
import { MediaExecutor } from '../media-executor';

// ── Fixtures ──

function makeFakePlayer(id: string, overrides: Partial<IVideoPlayer> = {}): IVideoPlayer {
  return {
    id,
    platform: 'native',
    capabilities: {
      play: true, pause: true, seek: true, setVolume: true,
      mute: true, unmute: true, getState: true,
      nextTrack: false, previousTrack: false, shuffle: false,
    },
    anchorElement: document.createElement('div'),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    mute: vi.fn(async () => {}),
    unmute: vi.fn(async () => {}),
    getState: vi.fn(async () => ({
      currentTime: 10, duration: 60, paused: false, volume: 1,
      muted: false, playbackRate: 1, title: 'Test', platform: 'native' as const,
      hasPlaylist: false,
    })),
    isAlive: () => true,
    dispose: () => {},
    ...overrides,
  };
}

function makeLiveMediaState(overrides: Partial<MediaLiveState> = {}): MediaLiveState {
  return {
    playerId: 'test-0',
    platform: 'native',
    title: 'Test Video',
    paused: false,
    currentTime: 30,
    duration: 120,
    volume: 0.8,
    muted: false,
    fullscreen: false,
    captions: false,
    playbackRate: 1,
    hasPlaylist: false,
    ...overrides,
  };
}

function makeSnapshot(media: MediaLiveState[]): LiveStateSnapshot {
  return {
    timestamp: Date.now(),
    media,
    forms: [],
    navigation: { currentUrl: '', scrollPercent: 0 },
    auth: { isLoggedIn: false, hasLoginForm: false, hasLogoutButton: false },
    interactive: {
      openModals: [], expandedAccordions: [], openDropdowns: [],
      activeTooltips: [], visibleNotifications: [],
    },
    visibility: { overlays: [], loadingIndicators: false },
  };
}

function makeTool(action: string, playerId: string): Tool {
  return {
    name: `media.${action}.${playerId}`,
    description: `${action}: Test Video`,
    category: 'media',
    inputSchema: { type: 'object', properties: {} },
    _el: document.createElement('div'),
  };
}

// ── Tests ──

describe('MediaExecutor pre-checks', () => {
  let executor: MediaExecutor;
  let fakePlayer: IVideoPlayer;

  beforeEach(() => {
    document.body.innerHTML = '';
    getPlayerRegistry().dispose();
    executor = new MediaExecutor();
    fakePlayer = makeFakePlayer('test-0');

    const registry = getPlayerRegistry();
    vi.spyOn(registry, 'refresh').mockReturnValue([fakePlayer]);
    vi.spyOn(registry, 'getById').mockReturnValue(fakePlayer);
  });

  it('skips play when already playing', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ paused: false })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('play', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(result.message).toContain('Already playing');
    expect(fakePlayer.play).not.toHaveBeenCalled();
  });

  it('executes play when paused', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ paused: true })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('play', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(result.message).toContain('Playing');
    expect(fakePlayer.play).toHaveBeenCalledOnce();
  });

  it('skips pause when already paused', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ paused: true })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('pause', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(result.message).toContain('Already paused');
    expect(fakePlayer.pause).not.toHaveBeenCalled();
  });

  it('executes pause when playing', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ paused: false })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('pause', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(fakePlayer.pause).toHaveBeenCalledOnce();
  });

  it('skips mute when already muted', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ muted: true })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('mute', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(result.message).toContain('Already muted');
    expect(fakePlayer.mute).not.toHaveBeenCalled();
  });

  it('skips unmute when already unmuted', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ muted: false })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('unmute', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(result.message).toContain('Already unmuted');
    expect(fakePlayer.unmute).not.toHaveBeenCalled();
  });

  it('skips set-volume when already at target level', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ volume: 0.5 })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('set-volume', 'test-0'), { level: 0.5 });
    expect(result.success).toBe(true);
    expect(result.message).toContain('already at 50%');
    expect(fakePlayer.setVolume).not.toHaveBeenCalled();
  });

  it('executes set-volume when target differs', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ volume: 0.5 })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('set-volume', 'test-0'), { level: 0.8 });
    expect(result.success).toBe(true);
    expect(fakePlayer.setVolume).toHaveBeenCalledWith(0.8);
  });

  it('executes normally when no live state available', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => null,
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('play', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(fakePlayer.play).toHaveBeenCalledOnce();
  });

  it('executes normally when player not in live state', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState({ playerId: 'other-player' })]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('play', 'test-0'), {});
    expect(result.success).toBe(true);
    expect(fakePlayer.play).toHaveBeenCalledOnce();
  });

  it('always executes seek regardless of state', async () => {
    vi.spyOn(liveStateModule, 'getLiveStateManager').mockReturnValue({
      getLatestSnapshot: () => makeSnapshot([makeLiveMediaState()]),
    } as ReturnType<typeof liveStateModule.getLiveStateManager>);

    const result = await executor.execute(makeTool('seek', 'test-0'), { time: 45 });
    expect(result.success).toBe(true);
    expect(fakePlayer.seek).toHaveBeenCalledWith(45);
  });
});
