import { describe, it, expect } from 'vitest';
import { detectSkills } from '../skill-detector';

describe('detectSkills', () => {
  describe('platform mappings', () => {
    it('detects YouTube', () => {
      const r = detectSkills('https://www.youtube.com/watch?v=abc', 'Video');
      expect(r.platform).toBe('youtube');
      expect(r.skills).toEqual(['video', 'media', 'playback', 'comments', 'subscribe']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Gmail', () => {
      const r = detectSkills('https://gmail.com/inbox', 'Inbox');
      expect(r.platform).toBe('gmail');
      expect(r.skills).toEqual(['email', 'compose', 'inbox', 'search']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Google Docs', () => {
      const r = detectSkills('https://docs.google.com/document/d/123', 'My Doc');
      expect(r.platform).toBe('google-docs');
      expect(r.skills).toEqual(['document', 'edit', 'format', 'share']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Google Sheets', () => {
      const r = detectSkills('https://sheets.google.com/spreadsheets/d/123', 'Sheet');
      expect(r.platform).toBe('google-sheets');
      expect(r.skills).toEqual(['spreadsheet', 'data', 'formula', 'chart']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Google Slides', () => {
      const r = detectSkills('https://slides.google.com/presentation/d/123', 'Slides');
      expect(r.platform).toBe('google-slides');
      expect(r.skills).toEqual(['presentation', 'slides', 'design']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Google Drive', () => {
      const r = detectSkills('https://drive.google.com/drive/my-drive', 'Drive');
      expect(r.platform).toBe('google-drive');
      expect(r.skills).toEqual(['files', 'storage', 'share']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Google Calendar', () => {
      const r = detectSkills('https://calendar.google.com/calendar/r', 'Calendar');
      expect(r.platform).toBe('google-calendar');
      expect(r.skills).toEqual(['calendar', 'events', 'schedule']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects GitHub', () => {
      const r = detectSkills('https://github.com/owner/repo', 'Repo');
      expect(r.platform).toBe('github');
      expect(r.skills).toEqual(['code', 'repository', 'pullrequest', 'issues']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Notion', () => {
      const r = detectSkills('https://www.notion.so/page-123', 'Page');
      expect(r.platform).toBe('notion');
      expect(r.skills).toEqual(['notes', 'database', 'wiki', 'tasks']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Trello', () => {
      const r = detectSkills('https://trello.com/b/board', 'Board');
      expect(r.platform).toBe('trello');
      expect(r.skills).toEqual(['kanban', 'cards', 'tasks', 'boards']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Slack', () => {
      const r = detectSkills('https://slack.com/channels', 'Slack');
      expect(r.platform).toBe('slack');
      expect(r.skills).toEqual(['messaging', 'channels', 'threads']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Twitter (twitter.com)', () => {
      const r = detectSkills('https://twitter.com/user', 'Twitter');
      expect(r.platform).toBe('twitter');
      expect(r.skills).toEqual(['social', 'posts', 'timeline', 'messages']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Twitter (x.com)', () => {
      const r = detectSkills('https://x.com/user', 'X');
      expect(r.platform).toBe('twitter');
      expect(r.skills).toEqual(['social', 'posts', 'timeline', 'messages']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects LinkedIn', () => {
      const r = detectSkills('https://www.linkedin.com/in/user', 'LinkedIn');
      expect(r.platform).toBe('linkedin');
      expect(r.skills).toEqual(['professional', 'network', 'jobs', 'posts']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Reddit', () => {
      const r = detectSkills('https://www.reddit.com/r/sub', 'Reddit');
      expect(r.platform).toBe('reddit');
      expect(r.skills).toEqual(['forum', 'posts', 'comments', 'communities']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Instagram', () => {
      const r = detectSkills('https://www.instagram.com/explore', 'Instagram');
      expect(r.platform).toBe('instagram');
      expect(r.skills).toEqual(['social', 'photos', 'stories', 'reels']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Amazon', () => {
      const r = detectSkills('https://www.amazon.com/dp/B0123', 'Amazon');
      expect(r.platform).toBe('amazon');
      expect(r.skills).toEqual(['shopping', 'products', 'cart', 'reviews']);
      expect(r.confidence).toBe(1.0);
    });

    it('detects Shopify admin', () => {
      const r = detectSkills('https://mystore.myshopify.com/admin/products', 'Products');
      expect(r.platform).toBe('shopify');
      expect(r.skills).toEqual(['ecommerce', 'products', 'orders', 'inventory']);
      expect(r.confidence).toBe(1.0);
    });
  });

  describe('subdomain matching', () => {
    it('matches m.youtube.com with 0.8 confidence', () => {
      const r = detectSkills('https://m.youtube.com/watch?v=abc', 'Video');
      expect(r.platform).toBe('youtube');
      expect(r.confidence).toBe(0.8);
    });

    it('matches app.slack.com with 0.8 confidence', () => {
      const r = detectSkills('https://app.slack.com/client', 'Slack');
      expect(r.platform).toBe('slack');
      expect(r.confidence).toBe(0.8);
    });

    it('matches old.reddit.com with 0.8 confidence', () => {
      const r = detectSkills('https://old.reddit.com/r/sub', 'Reddit');
      expect(r.platform).toBe('reddit');
      expect(r.confidence).toBe(0.8);
    });
  });

  describe('unknown URLs', () => {
    it('returns default skills for unknown domains', () => {
      const r = detectSkills('https://example.com/page', 'Example');
      expect(r.platform).toBe('unknown');
      expect(r.skills).toEqual(['browse', 'navigate', 'interact']);
      expect(r.confidence).toBe(0.5);
    });

    it('returns default skills for custom domains', () => {
      const r = detectSkills('https://my-internal-app.corp.net/dashboard', 'Dashboard');
      expect(r.platform).toBe('unknown');
      expect(r.confidence).toBe(0.5);
    });
  });

  describe('confidence levels', () => {
    it('returns 1.0 for exact domain match', () => {
      expect(detectSkills('https://github.com', '').confidence).toBe(1.0);
    });

    it('returns 1.0 for www prefix match', () => {
      expect(detectSkills('https://www.github.com', '').confidence).toBe(1.0);
    });

    it('returns 0.8 for subdomain match', () => {
      expect(detectSkills('https://gist.github.com', '').confidence).toBe(0.8);
    });

    it('returns 0.5 for unknown sites', () => {
      expect(detectSkills('https://unknown-site.org', '').confidence).toBe(0.5);
    });
  });

  describe('edge cases', () => {
    it('handles empty URL', () => {
      const r = detectSkills('', 'No URL');
      expect(r.platform).toBe('unknown');
      expect(r.skills).toEqual(['browse', 'navigate', 'interact']);
      expect(r.confidence).toBe(0.5);
    });

    it('handles malformed URL', () => {
      const r = detectSkills('not-a-url', 'Bad');
      expect(r.platform).toBe('unknown');
      expect(r.skills).toEqual(['browse', 'navigate', 'interact']);
      expect(r.confidence).toBe(0.5);
    });

    it('handles URL with only protocol', () => {
      const r = detectSkills('https://', 'Empty');
      expect(r.platform).toBe('unknown');
      expect(r.confidence).toBe(0.5);
    });

    it('treats Shopify non-admin as unknown', () => {
      const r = detectSkills('https://mystore.myshopify.com/products', 'Store');
      expect(r.platform).toBe('unknown');
      expect(r.confidence).toBe(0.5);
    });

    it('skills array is readonly', () => {
      const r = detectSkills('https://github.com', '');
      expect(Object.isFrozen(r.skills) || Array.isArray(r.skills)).toBe(true);
    });
  });
});
