import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalGateAdapter } from '../approval-gate-adapter';
import type { IToolExecutionPort } from '../../ports/tool-execution.port';
import type { ApprovalCallback, TierResolver } from '../approval-gate-adapter';
import type { ToolCallResult, ToolDefinition } from '../../ports/types';
import { SecurityTierLevel } from '../../utils/constants';

// ── Helpers ──

function createMockInner(): IToolExecutionPort {
  return {
    execute: vi.fn<IToolExecutionPort['execute']>().mockResolvedValue({ success: true, data: 'ok' }),
    getAvailableTools: vi.fn<IToolExecutionPort['getAvailableTools']>().mockResolvedValue([]),
    onToolsChanged: vi.fn<IToolExecutionPort['onToolsChanged']>().mockReturnValue(() => {}),
  };
}

describe('ApprovalGateAdapter', () => {
  let inner: ReturnType<typeof createMockInner>;
  let resolveTier: TierResolver;
  let onApprovalNeeded: ApprovalCallback;
  let adapter: ApprovalGateAdapter;
  const target = { tabId: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    inner = createMockInner();
    resolveTier = vi.fn().mockReturnValue(SecurityTierLevel.SAFE);
    onApprovalNeeded = vi.fn<ApprovalCallback>().mockResolvedValue('approved');
    adapter = new ApprovalGateAdapter(inner, resolveTier, onApprovalNeeded);
  });

  // ── Auto-approve safe tiers ──

  it('auto-approves Tier 0 (safe) tools without callback', async () => {
    (resolveTier as ReturnType<typeof vi.fn>).mockReturnValue(SecurityTierLevel.SAFE);
    await adapter.execute('read_text', {}, target);
    expect(onApprovalNeeded).not.toHaveBeenCalled();
    expect(inner.execute).toHaveBeenCalledWith('read_text', {}, target);
  });

  it('auto-approves Tier 1 (navigation) tools without callback', async () => {
    (resolveTier as ReturnType<typeof vi.fn>).mockReturnValue(SecurityTierLevel.NAVIGATION);
    await adapter.execute('click_link', {}, target);
    expect(onApprovalNeeded).not.toHaveBeenCalled();
    expect(inner.execute).toHaveBeenCalledWith('click_link', {}, target);
  });

  // ── Tier 2 approval ──

  it('requests approval for Tier 2 (mutation) tools', async () => {
    (resolveTier as ReturnType<typeof vi.fn>).mockReturnValue(SecurityTierLevel.MUTATION);
    await adapter.execute('delete_item', { id: '1' }, target);
    expect(onApprovalNeeded).toHaveBeenCalledWith({
      toolName: 'delete_item',
      args: { id: '1' },
      tier: SecurityTierLevel.MUTATION,
      description: 'Execute delete_item',
    });
  });

  it('executes tool when approved', async () => {
    (resolveTier as ReturnType<typeof vi.fn>).mockReturnValue(SecurityTierLevel.MUTATION);
    (onApprovalNeeded as ReturnType<typeof vi.fn>).mockResolvedValue('approved');
    const result = await adapter.execute('submit_form', { data: 'x' }, target);
    expect(inner.execute).toHaveBeenCalledWith('submit_form', { data: 'x' }, target);
    expect(result.success).toBe(true);
  });

  it('returns denied error when user denies', async () => {
    (resolveTier as ReturnType<typeof vi.fn>).mockReturnValue(SecurityTierLevel.MUTATION);
    (onApprovalNeeded as ReturnType<typeof vi.fn>).mockResolvedValue('denied');
    const result = await adapter.execute('delete_item', {}, target);
    expect(result).toEqual({
      success: false,
      error: 'Tool "delete_item" execution denied by user.',
    });
    expect(inner.execute).not.toHaveBeenCalled();
  });

  // ── YOLO mode ──

  it('skips approval in YOLO mode', async () => {
    (resolveTier as ReturnType<typeof vi.fn>).mockReturnValue(SecurityTierLevel.MUTATION);
    adapter.setAutoApprove(true);
    await adapter.execute('delete_item', {}, target);
    expect(onApprovalNeeded).not.toHaveBeenCalled();
    expect(inner.execute).toHaveBeenCalled();
  });

  it('setAutoApprove toggles YOLO mode', () => {
    expect(adapter.isAutoApprove()).toBe(false);
    adapter.setAutoApprove(true);
    expect(adapter.isAutoApprove()).toBe(true);
    adapter.setAutoApprove(false);
    expect(adapter.isAutoApprove()).toBe(false);
  });

  // ── Delegation ──

  it('delegates getAvailableTools to inner', async () => {
    const tools: readonly ToolDefinition[] = [
      { name: 'a', description: 'A', parametersSchema: {} },
    ];
    (inner.getAvailableTools as ReturnType<typeof vi.fn>).mockResolvedValue(tools);
    const result = await adapter.getAvailableTools(1);
    expect(result).toBe(tools);
    expect(inner.getAvailableTools).toHaveBeenCalledWith(1);
  });

  it('delegates onToolsChanged to inner', () => {
    const cb = vi.fn();
    const unsub = vi.fn();
    (inner.onToolsChanged as ReturnType<typeof vi.fn>).mockReturnValue(unsub);
    const result = adapter.onToolsChanged(cb);
    expect(inner.onToolsChanged).toHaveBeenCalledWith(cb);
    expect(result).toBe(unsub);
  });

  // ── requestApproval ──

  it('requestApproval returns approved in auto-approve mode', async () => {
    adapter.setAutoApprove(true);
    const decision = await adapter.requestApproval({
      toolName: 'delete_item',
      args: {},
      tier: SecurityTierLevel.MUTATION,
      description: 'test',
    });
    expect(decision).toBe('approved');
    expect(onApprovalNeeded).not.toHaveBeenCalled();
  });

  it('requestApproval delegates to callback when not auto-approve', async () => {
    (onApprovalNeeded as ReturnType<typeof vi.fn>).mockResolvedValue('denied');
    const request = {
      toolName: 'delete_item',
      args: {},
      tier: SecurityTierLevel.MUTATION,
      description: 'test',
    };
    const decision = await adapter.requestApproval(request);
    expect(decision).toBe('denied');
    expect(onApprovalNeeded).toHaveBeenCalledWith(request);
  });
});
