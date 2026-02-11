/**
 * Base executor class and shared result type.
 * All category executors extend this and implement execute().
 */

import type { Tool, ToolCategory } from '../../types';

/** Outcome of a tool execution */
export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Abstract base class for all category executors.
 * Provides shared DOM helpers used across multiple strategies.
 */
export abstract class BaseExecutor {
  abstract readonly category: ToolCategory;

  abstract execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult>;

  /** Resolve the tool's associated DOM element */
  protected findElement(tool: Tool): Element | null {
    return tool._el ?? null;
  }

  /** Fire a sequence of events on an element */
  protected dispatchEvents(el: Element, events: string[]): void {
    for (const name of events) {
      el.dispatchEvent(new Event(name, { bubbles: true }));
    }
  }

  /** Poll for an element matching `selector` to appear in the DOM */
  protected waitForElement(
    selector: string,
    timeout = 3000,
  ): Promise<Element | null> {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }

      const interval = 200;
      let elapsed = 0;

      const timer = setInterval(() => {
        elapsed += interval;
        const found = document.querySelector(selector);
        if (found || elapsed >= timeout) {
          clearInterval(timer);
          resolve(found);
        }
      }, interval);
    });
  }

  /** Parse args that may arrive as a JSON string */
  protected parseArgs(args: Record<string, unknown>): Record<string, unknown> {
    if (typeof args === 'string') {
      return JSON.parse(args) as Record<string, unknown>;
    }
    return args;
  }

  /** Convenience: return a success result */
  protected ok(message: string, data?: unknown): ExecutionResult {
    return { success: true, message, data };
  }

  /** Convenience: return a failure result */
  protected fail(message: string, data?: unknown): ExecutionResult {
    return { success: false, message, data };
  }
}
