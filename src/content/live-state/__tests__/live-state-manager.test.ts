import { beforeEach, describe, expect, it } from 'vitest';
import type {
  IStateProvider,
  MediaLiveState,
  FormLiveState,
} from '../../../types/live-state.types';
import { LiveStateManager } from '../live-state-manager';

// ── Fixture helpers ──

function makeMediaProvider(states: MediaLiveState[]): IStateProvider<MediaLiveState> {
  return {
    category: 'media',
    collect: () => states,
    dispose: () => {},
  };
}

function makeFormProvider(states: FormLiveState[]): IStateProvider<FormLiveState> {
  return {
    category: 'form',
    collect: () => states,
    dispose: () => {},
  };
}

const MEDIA_FIXTURE: MediaLiveState = {
  playerId: 'yt-0',
  platform: 'youtube',
  title: 'Test',
  paused: false,
  currentTime: 10,
  duration: 60,
  volume: 1,
  muted: false,
  fullscreen: false,
  captions: false,
  playbackRate: 1,
  hasPlaylist: false,
};

const FORM_FIXTURE: FormLiveState = {
  formId: 'login',
  toolName: 'auth-login',
  totalFields: 2,
  filledFields: 1,
  dirtyFields: ['email'],
  hasValidationErrors: false,
  completionPercent: 50,
  fields: [],
};

// ── Tests ──

describe('LiveStateManager', () => {
  let manager: LiveStateManager;

  beforeEach(() => {
    manager = new LiveStateManager();
  });

  it('returns null snapshot before first collection', () => {
    expect(manager.getLatestSnapshot()).toBeNull();
  });

  it('collects snapshot with defaults when no providers registered', () => {
    const snap = manager.collectSnapshot(document);
    expect(snap.media).toEqual([]);
    expect(snap.forms).toEqual([]);
    expect(snap.navigation.currentUrl).toBe('');
    expect(snap.auth.isLoggedIn).toBe(false);
    expect(snap.interactive.openModals).toEqual([]);
  });

  it('collects media state from registered provider', () => {
    manager.registerProvider(makeMediaProvider([MEDIA_FIXTURE]));
    const snap = manager.collectSnapshot(document);
    expect(snap.media).toHaveLength(1);
    expect(snap.media[0].playerId).toBe('yt-0');
    expect(snap.media[0].paused).toBe(false);
  });

  it('collects form state from registered provider', () => {
    manager.registerProvider(makeFormProvider([FORM_FIXTURE]));
    const snap = manager.collectSnapshot(document);
    expect(snap.forms).toHaveLength(1);
    expect(snap.forms[0].formId).toBe('login');
    expect(snap.forms[0].completionPercent).toBe(50);
  });

  it('caches latest snapshot', () => {
    manager.registerProvider(makeMediaProvider([MEDIA_FIXTURE]));
    manager.collectSnapshot(document);
    const cached = manager.getLatestSnapshot();
    expect(cached).not.toBeNull();
    expect(cached!.media).toHaveLength(1);
  });

  it('overwrites previous snapshot on re-collect', () => {
    manager.registerProvider(makeMediaProvider([MEDIA_FIXTURE]));
    const snap1 = manager.collectSnapshot(document);
    const snap2 = manager.collectSnapshot(document);
    expect(snap2.timestamp).toBeGreaterThanOrEqual(snap1.timestamp);
  });

  it('finds provider by category', () => {
    const provider = makeMediaProvider([]);
    manager.registerProvider(provider);
    expect(manager.getProviderByCategory('media')).toBe(provider);
    expect(manager.getProviderByCategory('form')).toBeUndefined();
  });

  it('manages lifecycle start/stop', () => {
    expect(manager.isRunning()).toBe(false);
    manager.start();
    expect(manager.isRunning()).toBe(true);
    manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it('dispose clears providers and snapshot', () => {
    manager.registerProvider(makeMediaProvider([MEDIA_FIXTURE]));
    manager.collectSnapshot(document);
    manager.dispose();
    expect(manager.getLatestSnapshot()).toBeNull();
    expect(manager.getProviderByCategory('media')).toBeUndefined();
  });

  it('handles provider returning single item (not array)', () => {
    const singleProvider: IStateProvider<MediaLiveState> = {
      category: 'media',
      collect: () => MEDIA_FIXTURE,
      dispose: () => {},
    };
    manager.registerProvider(singleProvider);
    const snap = manager.collectSnapshot(document);
    expect(snap.media).toHaveLength(1);
    expect(snap.media[0].playerId).toBe('yt-0');
  });

  it('handles empty array from provider gracefully', () => {
    manager.registerProvider(makeMediaProvider([]));
    const snap = manager.collectSnapshot(document);
    expect(snap.media).toEqual([]);
  });
});
