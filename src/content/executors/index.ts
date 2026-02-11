/**
 * Executor registry: maps tool categories to their executor instances.
 */

import type { Tool, ToolCategory } from '../../types';
import { type ExecutionResult } from './base-executor';
import type { BaseExecutor } from './base-executor';

import { FormExecutor } from './form-executor';
import { NavigationExecutor } from './navigation-executor';
import { SearchExecutor } from './search-executor';
import { InteractiveExecutor } from './interactive-executor';
import { MediaExecutor } from './media-executor';
import { EcommerceExecutor } from './ecommerce-executor';
import { AuthExecutor } from './auth-executor';
import { PageStateExecutor } from './page-state-executor';
import { SchemaOrgExecutor } from './schema-org-executor';
import { RichTextExecutor } from './richtext-executor';
import { FileUploadExecutor } from './file-upload-executor';
import { SocialExecutor } from './social-executor';

export { type ExecutionResult } from './base-executor';
export { BaseExecutor } from './base-executor';

export class ExecutorRegistry {
  private executors: Map<ToolCategory, BaseExecutor>;

  constructor() {
    const all: BaseExecutor[] = [
      new FormExecutor(),
      new NavigationExecutor(),
      new SearchExecutor(),
      new InteractiveExecutor(),
      new MediaExecutor(),
      new EcommerceExecutor(),
      new AuthExecutor(),
      new PageStateExecutor(),
      new SchemaOrgExecutor(),
      new RichTextExecutor(),
      new FileUploadExecutor(),
      new SocialExecutor(),
    ];

    this.executors = new Map(all.map((e) => [e.category, e]));
  }

  /** Execute a tool using the matching category executor */
  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const category = tool.category;
    if (!category) {
      return {
        success: false,
        message: `No category on tool "${tool.name}"`,
      };
    }

    const executor = this.executors.get(category);
    if (!executor) {
      return {
        success: false,
        message: `No executor for category "${category}"`,
      };
    }

    console.debug(
      `[WMCP-Executor] Executing "${tool.name}" (${category})`,
      args,
    );

    return executor.execute(tool, args);
  }

  /** Get the executor for a specific category */
  getExecutor(category: ToolCategory): BaseExecutor | undefined {
    return this.executors.get(category);
  }
}
