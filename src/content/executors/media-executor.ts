/**
 * Media executor: play, pause, seek on audio/video elements.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class MediaExecutor extends BaseExecutor {
  readonly category = 'media' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLMediaElement | null;
    if (!el) return this.fail('Media element not found');

    if (tool.name.includes('.play-')) {
      el.play();
      return this.ok(`Playing: ${tool.description}`);
    }

    if (tool.name.includes('.pause-')) {
      el.pause();
      return this.ok(`Paused: ${tool.description}`);
    }

    if (tool.name.includes('.seek-')) {
      const parsed = this.parseArgs(args);
      const time = Number(parsed.time ?? 0);
      el.currentTime = time;
      return this.ok(`Seeked to ${time}s: ${tool.description}`);
    }

    return this.fail('Unknown media action');
  }
}
