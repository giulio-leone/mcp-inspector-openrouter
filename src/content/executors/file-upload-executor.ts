/**
 * File-upload executor: triggers file input click or drop zone click.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class FileUploadExecutor extends BaseExecutor {
  readonly category = 'file-upload' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLElement | null;
    if (!el) return this.fail('Upload element not found');

    const parsed = this.parseArgs(args);
    const filePath = parsed.file_path as string | undefined;
    if (!filePath) return this.fail('No file_path provided');

    const label = tool.title ?? tool.name;

    if (
      el instanceof HTMLInputElement &&
      el.type === 'file'
    ) {
      el.click();
      return this.ok(
        `Opened file picker for: ${label}. ` +
          `Please manually select: ${filePath}. ` +
          `Note: For automated file upload, use Chrome DevTools MCP upload_file tool.`,
      );
    }

    // Drop zones, buttons, etc.
    el.click();
    return this.ok(
      `Clicked upload trigger: ${label}. Please use Chrome DevTools MCP for actual file upload.`,
    );
  }
}
