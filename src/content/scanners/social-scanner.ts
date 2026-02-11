/**
 * Social Action Scanner — discovers like, share, comment, repost, follow,
 * subscribe buttons on social media platforms.
 *
 * Uses first-word matching (not substring) to avoid false positives.
 * Runs BEFORE the interactive scanner so social buttons are claimed here.
 */

import type { Tool, ToolAnnotations } from '../../types';
import { BaseScanner } from './base-scanner';

/** Social action classification */
type SocialActionType = 'like' | 'share' | 'follow' | 'comment';

// Keyword patterns — must match as whole word at the START of the label
const LIKE_RE = /^(reagisci|like|mi piace|consiglia|upvote|heart)/i;
const SHARE_RE = /^(share|condividi|diffondi|repost|retweet|diffusione)/i;
const FOLLOW_RE = /^(follow|segui|subscribe|iscriviti)/i;
const COMMENT_RE = /^(comment|commenta|reply|rispondi|risposta)/i;

const DESCRIPTIONS: Record<SocialActionType, string> = {
  like: 'Like/React',
  share: 'Share/Repost',
  follow: 'Follow/Subscribe',
  comment: 'Open comment/reply',
};

const TITLES: Record<SocialActionType, string> = {
  like: 'Like',
  share: 'Share',
  follow: 'Follow',
  comment: 'Comment',
};

export class SocialScanner extends BaseScanner {
  readonly category = 'social-action' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const seen = new Set<string>();

    const candidates = (root as ParentNode).querySelectorAll(
      '[aria-label], [data-testid*="like" i], [data-testid*="share" i], ' +
        '[data-testid*="retweet" i], [data-testid*="follow" i], [data-testid*="comment" i], ' +
        '[data-testid*="reply" i]',
    );

    for (const btn of candidates) {
      if (tools.length >= this.maxTools) break;
      if (this.isClaimed(btn)) continue;
      if (!this.isVisible(btn)) continue;
      if (!this.hasMeaningfulSize(btn)) continue;

      const label = (btn.getAttribute('aria-label') || '').trim();
      const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
      if (!label && !testId) continue;

      // Classify by label or data-testid
      const actionType = this.classify(label, testId, btn);
      if (!actionType) continue;

      // Build a short, clean slug
      const shortLabel = label.length > 40 ? label.slice(0, 40) : label;
      const slug = this.slugify(shortLabel) || actionType;
      const key = `${actionType}-${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      this.claim(btn);
      tools.push(
        this.createTool(
          `social.${actionType}-${slug}`,
          `${DESCRIPTIONS[actionType]}: ${shortLabel || actionType}`,
          btn,
          this.makeInputSchema([]),
          0.8,
          {
            title: `${TITLES[actionType]}: ${shortLabel || actionType}`,
            annotations: this.socialAnnotations(actionType),
          },
        ),
      );
    }

    return tools;
  }

  /** Classify a candidate element into a social action type */
  private classify(
    label: string,
    testId: string,
    btn: Element,
  ): SocialActionType | null {
    if (LIKE_RE.test(label) || testId.includes('like') || testId.includes('heart')) {
      return 'like';
    }
    if (SHARE_RE.test(label) || testId.includes('share') || testId.includes('retweet')) {
      return 'share';
    }
    if (FOLLOW_RE.test(label) || testId.includes('follow')) {
      return 'follow';
    }
    if (COMMENT_RE.test(label) || testId.includes('comment') || testId.includes('reply')) {
      // Skip contenteditable (handled by richtext scanner)
      if ((btn as HTMLElement).isContentEditable) return null;
      return 'comment';
    }
    return null;
  }

  private socialAnnotations(actionType: SocialActionType): ToolAnnotations {
    return this.makeAnnotations({
      destructive: actionType !== 'comment',
      idempotent: actionType === 'comment',
    });
  }
}
