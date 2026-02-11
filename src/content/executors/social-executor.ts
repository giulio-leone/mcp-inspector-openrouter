/**
 * Social-action executor: like, share, follow, comment clicks.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class SocialExecutor extends BaseExecutor {
  readonly category = 'social-action' as const;

  async execute(tool: Tool): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLElement | null;
    if (!el) return this.fail('Social action element not found');

    el.click();

    if (tool.name.includes('.like-'))
      return this.ok(`Liked: ${tool.description}`);
    if (tool.name.includes('.share-'))
      return this.ok(`Shared/Reposted: ${tool.description}`);
    if (tool.name.includes('.follow-'))
      return this.ok(`Followed/Subscribed: ${tool.description}`);
    if (tool.name.includes('.comment-'))
      return this.ok(`Opened comment/reply: ${tool.description}`);

    return this.ok(`Social action executed: ${tool.name}`);
  }
}
