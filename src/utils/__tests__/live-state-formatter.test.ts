import { describe, it, expect } from 'vitest';
import { formatLiveStateForPrompt } from '../live-state-formatter';
import type {
  LiveStateSnapshot,
  MediaLiveState,
  FormLiveState,
  NavigationLiveState,
  AuthLiveState,
  InteractiveLiveState,
  VisibilityLiveState,
} from '../../types/live-state.types';

// ── Fixtures ──

const EMPTY_INTERACTIVE: InteractiveLiveState = {
  openModals: [],
  expandedAccordions: [],
  openDropdowns: [],
  activeTooltips: [],
  visibleNotifications: [],
};

const EMPTY_AUTH: AuthLiveState = {
  isLoggedIn: false,
  hasLoginForm: false,
  hasLogoutButton: false,
};

const EMPTY_NAV: NavigationLiveState = {
  currentUrl: '',
  scrollPercent: 0,
};

const EMPTY_VISIBILITY: VisibilityLiveState = {
  overlays: [],
  loadingIndicators: false,
};

function makeSnapshot(overrides: Partial<LiveStateSnapshot> = {}): LiveStateSnapshot {
  return {
    timestamp: Date.now(),
    media: [],
    forms: [],
    navigation: EMPTY_NAV,
    auth: EMPTY_AUTH,
    interactive: EMPTY_INTERACTIVE,
    visibility: EMPTY_VISIBILITY,
    ...overrides,
  };
}

// ── Tests ──

describe('formatLiveStateForPrompt', () => {
  it('returns empty string when all categories are empty', () => {
    expect(formatLiveStateForPrompt(makeSnapshot())).toBe('');
  });

  describe('media formatting', () => {
    it('formats a playing video', () => {
      const media: MediaLiveState = {
        playerId: 'yt-main',
        platform: 'youtube',
        title: 'Test Video',
        paused: false,
        currentTime: 83,
        duration: 213,
        volume: 0.8,
        muted: false,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('LIVE PAGE STATE');
      expect(result).toContain('🎬 Media Players');
      expect(result).toContain('▶️ PLAYING');
      expect(result).toContain('1:23/3:33');
      expect(result).toContain('volume 80%');
      expect(result).toContain('"Test Video"');
      expect(result).toContain('(youtube)');
    });

    it('formats a paused + muted video', () => {
      const media: MediaLiveState = {
        playerId: 'native-0',
        platform: 'native',
        title: 'BG Music',
        paused: true,
        currentTime: 0,
        duration: 135,
        volume: 0.5,
        muted: true,
        fullscreen: false,
        captions: false,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('⏸️ PAUSED');
      expect(result).toContain('🔇 MUTED');
      expect(result).toContain('0:00/2:15');
    });

    it('shows fullscreen indicator', () => {
      const media: MediaLiveState = {
        playerId: 'yt-0',
        platform: 'youtube',
        title: 'Fullscreen Vid',
        paused: false,
        currentTime: 10,
        duration: 100,
        volume: 1,
        muted: false,
        fullscreen: true,
        captions: false,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('📺 FULLSCREEN');
    });

    it('shows captions indicator', () => {
      const media: MediaLiveState = {
        playerId: 'yt-0',
        platform: 'youtube',
        title: 'Captioned Vid',
        paused: false,
        currentTime: 10,
        duration: 100,
        volume: 1,
        muted: false,
        fullscreen: false,
        captions: true,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('💬 CAPTIONS ON');
    });

    it('shows progress percentage', () => {
      const media: MediaLiveState = {
        playerId: 'yt-0',
        platform: 'youtube',
        title: 'Half Done',
        paused: false,
        currentTime: 150,
        duration: 300,
        volume: 1,
        muted: false,
        fullscreen: false,
        captions: false,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('2:30/5:00 (50%)');
    });

    it('includes speed when not 1x', () => {
      const media: MediaLiveState = {
        playerId: 'yt-0',
        platform: 'youtube',
        title: 'Fast',
        paused: false,
        currentTime: 10,
        duration: 100,
        volume: 1,
        muted: false,
        fullscreen: false,
        captions: false,
        playbackRate: 2,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('speed 2x');
    });

    it('omits speed when 1x', () => {
      const media: MediaLiveState = {
        playerId: 'yt-0',
        platform: 'youtube',
        title: 'Normal',
        paused: true,
        currentTime: 0,
        duration: 60,
        volume: 1,
        muted: false,
        fullscreen: false,
        captions: false,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).not.toContain('speed');
    });
  });

  describe('forms formatting', () => {
    it('formats form completion and dirty fields', () => {
      const form: FormLiveState = {
        formId: 'search-form',
        toolName: 'search',
        totalFields: 3,
        filledFields: 1,
        dirtyFields: ['query'],
        hasValidationErrors: false,
        completionPercent: 33,
        fields: [],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('📝 Forms');
      expect(result).toContain('1/3 filled (33%)');
      expect(result).toContain('dirty: [query]');
    });

    it('shows validation errors', () => {
      const form: FormLiveState = {
        formId: 'login',
        toolName: 'auth-login',
        totalFields: 2,
        filledFields: 0,
        dirtyFields: [],
        hasValidationErrors: true,
        completionPercent: 0,
        fields: [],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('has validation errors');
    });

    it('formats per-field details', () => {
      const form: FormLiveState = {
        formId: 'login',
        toolName: 'auth-login',
        totalFields: 2,
        filledFields: 1,
        dirtyFields: [],
        hasValidationErrors: false,
        completionPercent: 50,
        fields: [
          { name: 'email', label: 'Email', type: 'email', value: 'user@test.com', filled: true, required: true, valid: true },
          { name: 'password', label: 'Password', type: 'password', value: '', filled: false, required: true, valid: true },
        ],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('• Email (email): ✅ = "user@test.com"');
      expect(result).toContain('• Password (password): ❌ REQUIRED');
    });

    it('truncates long values', () => {
      const longValue = 'a'.repeat(80);
      const form: FormLiveState = {
        formId: 'f',
        toolName: '',
        totalFields: 1,
        filledFields: 1,
        dirtyFields: [],
        hasValidationErrors: false,
        completionPercent: 100,
        fields: [
          { name: 'bio', label: 'Bio', type: 'textarea', value: longValue, filled: true, required: false, valid: true },
        ],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('…');
      expect(result).not.toContain(longValue);
    });

    it('shows options for select fields', () => {
      const form: FormLiveState = {
        formId: 'settings',
        toolName: '',
        totalFields: 1,
        filledFields: 0,
        dirtyFields: [],
        hasValidationErrors: false,
        completionPercent: 0,
        fields: [
          { name: 'country', label: 'Country', type: 'select', value: '', filled: false, required: true, valid: true, options: ['US', 'UK', 'DE'] },
        ],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('[options: US, UK, DE]');
    });

    it('caps field display at 15', () => {
      const fields = Array.from({ length: 20 }, (_, i) => ({
        name: `field-${i}`, label: `Field ${i}`, type: 'text',
        value: 'v', filled: true, required: false, valid: true,
      }));
      const form: FormLiveState = {
        formId: 'big',
        toolName: '',
        totalFields: 20,
        filledFields: 20,
        dirtyFields: [],
        hasValidationErrors: false,
        completionPercent: 100,
        fields,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('Field 14');
      expect(result).not.toContain('Field 15');
    });

    it('shows unfilled optional fields as empty square', () => {
      const form: FormLiveState = {
        formId: 'f',
        toolName: '',
        totalFields: 1,
        filledFields: 0,
        dirtyFields: [],
        hasValidationErrors: false,
        completionPercent: 0,
        fields: [
          { name: 'notes', label: 'Notes', type: 'textarea', value: '', filled: false, required: false, valid: true },
        ],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('• Notes (textarea): ⬜');
    });

    it('uses formId when toolName is empty', () => {
      const form: FormLiveState = {
        formId: 'my-form',
        toolName: '',
        totalFields: 1,
        filledFields: 0,
        dirtyFields: [],
        hasValidationErrors: false,
        completionPercent: 0,
        fields: [],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('"my-form"');
    });
  });

  describe('navigation formatting', () => {
    it('formats URL, scroll, section, tab, breadcrumb', () => {
      const nav: NavigationLiveState = {
        currentUrl: 'https://example.com/products',
        scrollPercent: 45,
        visibleSection: 'Featured Products',
        activeTab: 'All',
        breadcrumb: ['Home', 'Products', 'Featured'],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ navigation: nav }));
      expect(result).toContain('🧭 Navigation');
      expect(result).toContain('https://example.com/products');
      expect(result).toContain('Scroll: 45%');
      expect(result).toContain('Section: "Featured Products"');
      expect(result).toContain('Tab: "All"');
      expect(result).toContain('Home > Products > Featured');
    });

    it('omits navigation when URL is empty', () => {
      const result = formatLiveStateForPrompt(makeSnapshot());
      expect(result).not.toContain('🧭');
    });
  });

  describe('auth formatting', () => {
    it('formats logged-in user', () => {
      const auth: AuthLiveState = {
        isLoggedIn: true,
        userName: 'John Doe',
        hasLoginForm: false,
        hasLogoutButton: true,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ auth }));
      expect(result).toContain('🔐 Auth');
      expect(result).toContain('✅ Logged in');
      expect(result).toContain('"John Doe"');
      expect(result).toContain('Logout available');
    });

    it('formats login form available', () => {
      const auth: AuthLiveState = {
        isLoggedIn: false,
        hasLoginForm: true,
        hasLogoutButton: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ auth }));
      expect(result).toContain('Login form available');
    });

    it('omits auth when all indicators are false', () => {
      const result = formatLiveStateForPrompt(makeSnapshot());
      expect(result).not.toContain('🔐');
    });
  });

  describe('interactive formatting', () => {
    it('formats open modals and notifications', () => {
      const interactive: InteractiveLiveState = {
        openModals: ['Cookie Consent'],
        expandedAccordions: ['FAQ 1'],
        openDropdowns: [],
        activeTooltips: [],
        visibleNotifications: ['Item added'],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ interactive }));
      expect(result).toContain('🎛️ Interactive');
      expect(result).toContain('"Cookie Consent"');
      expect(result).toContain('"FAQ 1"');
      expect(result).toContain('"Item added"');
    });

    it('omits interactive when all arrays are empty', () => {
      const result = formatLiveStateForPrompt(makeSnapshot());
      expect(result).not.toContain('🎛️');
    });
  });

  it('formats all categories together', () => {
    const snapshot = makeSnapshot({
      media: [{
        playerId: 'yt-0', platform: 'youtube', title: 'Song',
        paused: false, currentTime: 60, duration: 180,
        volume: 1, muted: false, fullscreen: false, captions: false,
        playbackRate: 1, hasPlaylist: false,
      }],
      forms: [{
        formId: 'search', toolName: 'search', totalFields: 2,
        filledFields: 1, dirtyFields: ['q'], hasValidationErrors: false,
        completionPercent: 50, fields: [],
      }],
      navigation: {
        currentUrl: 'https://example.com', scrollPercent: 10,
      },
      auth: { isLoggedIn: true, userName: 'Alice', hasLoginForm: false, hasLogoutButton: true },
      interactive: {
        openModals: ['Modal'], expandedAccordions: [], openDropdowns: [],
        activeTooltips: [], visibleNotifications: [],
      },
      visibility: { overlays: ['Cookie Banner'], loadingIndicators: true },
    });
    const result = formatLiveStateForPrompt(snapshot);
    expect(result).toContain('🎬');
    expect(result).toContain('📝');
    expect(result).toContain('🧭');
    expect(result).toContain('🔐');
    expect(result).toContain('🎛️');
    expect(result).toContain('👁️');
  });

  describe('visibility formatting', () => {
    it('formats overlays', () => {
      const result = formatLiveStateForPrompt(makeSnapshot({
        visibility: { overlays: ['Cookie Consent', 'Newsletter Popup'], loadingIndicators: false },
      }));
      expect(result).toContain('👁️ Visibility');
      expect(result).toContain('"Cookie Consent"');
      expect(result).toContain('"Newsletter Popup"');
      expect(result).toContain('Overlays blocking content');
    });

    it('formats loading indicators', () => {
      const result = formatLiveStateForPrompt(makeSnapshot({
        visibility: { overlays: [], loadingIndicators: true },
      }));
      expect(result).toContain('👁️ Visibility');
      expect(result).toContain('⏳ Page is loading');
    });

    it('omits visibility when empty', () => {
      const result = formatLiveStateForPrompt(makeSnapshot());
      expect(result).not.toContain('👁️');
    });
  });
});
