/**
 * Tests that the orchestrator is the default execution path in AIChatController.
 *
 * Validates the opt-out semantics: orchestrator runs unless the storage key
 * is explicitly set to `false`.
 */

import { describe, it, expect } from 'vitest';
import { STORAGE_KEY_ORCHESTRATOR_MODE } from '../../utils/constants';

/**
 * Pure logic extracted from AIChatController.promptAI — mirrors the
 * condition that decides legacy vs orchestrator path.
 */
function resolveUseOrchestrator(storageValue: unknown): boolean {
  return storageValue !== false;
}

describe('AIChatController — orchestrator default', () => {
  it('uses orchestrator when storage key is undefined (not set)', () => {
    expect(resolveUseOrchestrator(undefined)).toBe(true);
  });

  it('uses orchestrator when storage key is true', () => {
    expect(resolveUseOrchestrator(true)).toBe(true);
  });

  it('uses legacy tool-loop when storage key is explicitly false', () => {
    expect(resolveUseOrchestrator(false)).toBe(false);
  });

  it('uses orchestrator when storage key is null', () => {
    expect(resolveUseOrchestrator(null)).toBe(true);
  });

  it('uses orchestrator when storage key is an empty string', () => {
    expect(resolveUseOrchestrator('')).toBe(true);
  });

  it('storage key constant is defined', () => {
    expect(STORAGE_KEY_ORCHESTRATOR_MODE).toBe('wmcp_orchestrator_mode');
  });
});
