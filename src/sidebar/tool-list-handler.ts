/**
 * Tool list handler — utility functions for tool data formatting.
 */

import type { CleanTool } from '../types';

/**
 * Generate copy-to-clipboard text formats.
 */
export function toolsAsScriptToolConfig(tools: CleanTool[]): string {
  return tools
    .map(
      (t) =>
        `{ name: ${JSON.stringify(t.name)}, description: ${JSON.stringify(t.description)}, inputSchema: ${typeof t.inputSchema === 'string' ? t.inputSchema : JSON.stringify(t.inputSchema)} }`,
    )
    .join(',\n');
}

export function toolsAsJSON(tools: CleanTool[]): string {
  return JSON.stringify(tools, null, 2);
}
