/**
 * TabDelegationAdapter — A2A delegation via chrome.tabs message passing.
 * Scores tabs by skill overlap and delegates tasks with timing.
 */

import type {
  ITabDelegationPort,
  TabAgent,
  TabDelegationResult,
} from '../ports/tab-delegation.port';

export class TabDelegationAdapter implements ITabDelegationPort {
  private readonly tabs = new Map<number, TabAgent>();

  registerTab(tabId: number, url: string, title: string, skills: string[]): void {
    this.tabs.set(tabId, Object.freeze({ tabId, url, title, skills: Object.freeze([...skills]) }));
  }

  unregisterTab(tabId: number): void {
    this.tabs.delete(tabId);
  }

  /**
   * Scores each registered tab by the fraction of requiredSkills it covers.
   * Returns the tab with the highest overlap, or null if none match.
   */
  findTabForTask(requiredSkills: string[], excludeTabId?: number): TabAgent | null {
    if (requiredSkills.length === 0) return null;

    let best: TabAgent | null = null;
    let bestScore = 0;

    for (const agent of this.tabs.values()) {
      if (agent.tabId === excludeTabId) continue;
      const overlap = requiredSkills.filter(s => agent.skills.includes(s)).length;
      const score = overlap / requiredSkills.length;
      if (score > bestScore) {
        bestScore = score;
        best = agent;
      }
    }

    return best;
  }

  async delegate(
    sourceTabId: number,
    targetTabId: number,
    taskDescription: string,
  ): Promise<TabDelegationResult> {
    const target = this.tabs.get(targetTabId);
    if (!target) {
      return {
        sourceTabId,
        targetTabId,
        taskDescription,
        status: 'failed',
        error: `Tab ${targetTabId} is not registered`,
        durationMs: 0,
      };
    }

    const start = Date.now();
    try {
      const result: unknown = await chrome.tabs.sendMessage(targetTabId, {
        action: 'A2A_DELEGATE',
        taskDescription,
        sourceTabId,
      });
      return {
        sourceTabId,
        targetTabId,
        taskDescription,
        status: 'completed',
        result,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      return {
        sourceTabId,
        targetTabId,
        taskDescription,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  listRegisteredTabs(): readonly TabAgent[] {
    return [...this.tabs.values()];
  }
}
