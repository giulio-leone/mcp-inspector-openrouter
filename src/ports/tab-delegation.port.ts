/**
 * ITabDelegationPort — contract for A2A (Agent-to-Agent) delegation
 * between browser tabs. Enables skill-based task routing across tabs.
 */

export interface TabAgent {
  readonly tabId: number;
  readonly url: string;
  readonly title: string;
  readonly skills: readonly string[];
}

export interface TabDelegationResult {
  readonly sourceTabId: number;
  readonly targetTabId: number;
  readonly taskDescription: string;
  readonly status: 'completed' | 'failed';
  readonly result?: unknown;
  readonly error?: string;
  readonly durationMs: number;
}

export interface ITabDelegationPort {
  registerTab(tabId: number, url: string, title: string, skills: string[]): void;
  unregisterTab(tabId: number): void;
  findTabForTask(requiredSkills: string[], excludeTabId?: number): TabAgent | null;
  delegate(
    sourceTabId: number,
    targetTabId: number,
    taskDescription: string,
  ): Promise<TabDelegationResult>;
  listRegisteredTabs(): readonly TabAgent[];
}
