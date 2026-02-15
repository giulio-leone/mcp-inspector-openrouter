/**
 * MediaStateProvider — collects live state for media players on the page.
 *
 * Uses the PlayerRegistry to discover players and caches their async state
 * so that the synchronous collect() contract of IStateProvider is satisfied.
 */

import type { IStateProvider, MediaLiveState } from '../../../types/live-state.types';
import { getPlayerRegistry } from '../../media/player-registry';

/** Truncate a string to a maximum length */
function truncate(value: string, max = 100): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Detect if a video element is currently in fullscreen */
function isFullscreen(el: Element | null): boolean {
  if (!el) return false;
  try {
    const fsEl = el.ownerDocument?.fullscreenElement;
    if (!fsEl) return false;
    return fsEl === el || fsEl.contains(el) || el.contains(fsEl);
  } catch {
    return false;
  }
}

/** Detect if captions/subtitles are active on a media element */
function hasCaptionsActive(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLMediaElement)) return false;
  try {
    const tracks = el.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].mode === 'showing') return true;
    }
  } catch {
    // Ignore cross-origin or unavailable textTracks
  }
  return false;
}

export class MediaStateProvider implements IStateProvider<MediaLiveState> {
  readonly category = 'media' as const;

  private cache = new Map<string, MediaLiveState>();

  collect(_root: Document | Element): MediaLiveState[] {
    const registry = getPlayerRegistry();
    const alivePlayers = registry.getAll();
    const aliveIds = new Set(alivePlayers.map((p) => p.id));

    // Prune stale entries
    for (const id of this.cache.keys()) {
      if (!aliveIds.has(id)) {
        this.cache.delete(id);
      }
    }

    return Array.from(this.cache.values());
  }

  /**
   * Asynchronously refresh the cache by awaiting getState() on each player.
   * Call this before collectSnapshot() when an up-to-date read is needed.
   */
  async refreshAsync(root: Document | Element = document): Promise<void> {
    const registry = getPlayerRegistry();
    const players = registry.refresh(root);

    const entries = await Promise.all(
      players.map(async (player) => {
        try {
          const s = await player.getState();
          const state: MediaLiveState = {
            playerId: player.id,
            platform: s.platform,
            title: truncate(s.title),
            paused: s.paused,
            currentTime: s.currentTime,
            duration: s.duration,
            volume: s.volume,
            muted: s.muted,
            fullscreen: isFullscreen(player.anchorElement),
            captions: hasCaptionsActive(player.anchorElement),
            playbackRate: s.playbackRate,
            hasPlaylist: s.hasPlaylist,
            ...(s.playlistIndex !== undefined && { playlistIndex: s.playlistIndex }),
            ...(s.playlistLength !== undefined && { playlistLength: s.playlistLength }),
          };
          return [player.id, state] as const;
        } catch {
          return null;
        }
      }),
    );

    this.cache.clear();
    for (const entry of entries) {
      if (entry) {
        this.cache.set(entry[0], entry[1]);
      }
    }
  }

  dispose(): void {
    this.cache.clear();
  }
}
