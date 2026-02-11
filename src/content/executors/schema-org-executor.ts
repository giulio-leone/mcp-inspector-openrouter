/**
 * Schema.org executor: resolves action URL template and navigates.
 */

import type { Tool, SchemaOrgTarget } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class SchemaOrgExecutor extends BaseExecutor {
  readonly category = 'schema-org' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const action = tool._schemaAction;
    if (!action?.target) return this.fail('No Schema.org target');

    let url: string;
    if (typeof action.target === 'string') {
      url = action.target;
    } else {
      const target = action.target as SchemaOrgTarget;
      url = target.urlTemplate ?? target.url ?? '';
    }

    if (args) {
      const parsed = this.parseArgs(args);
      for (const [key, value] of Object.entries(parsed)) {
        url = url.replace(
          `{${key}}`,
          encodeURIComponent(String(value)),
        );
      }
    }

    if (url) {
      window.location.href = url;
      return this.ok(`Navigating to Schema.org action: ${url}`);
    }

    return this.fail('Could not resolve Schema.org action URL');
  }
}
