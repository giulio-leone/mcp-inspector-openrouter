/**
 * Merge utilities: union-merge 3 tool tiers with priority,
 * plus security tier classification.
 */

import type { Tool, SecurityTier, ToolCategory } from '../types';
import { SecurityTierLevel } from '../utils/constants';

/**
 * Union-merge tool sets from all 3 discovery tiers.
 * Priority: native > declarative > inferred (by name collision).
 */
export function mergeToolSets(
  nativeTools: readonly Tool[],
  declarativeTools: readonly Tool[],
  inferredTools: readonly Tool[],
): Tool[] {
  const byName = new Map<string, Tool>();

  for (const tool of nativeTools) {
    byName.set(tool.name, { ...tool, _source: 'native' });
  }

  for (const tool of declarativeTools) {
    if (!byName.has(tool.name)) {
      byName.set(tool.name, { ...tool, _source: 'declarative' });
    }
  }

  for (const tool of inferredTools) {
    if (!byName.has(tool.name)) {
      byName.set(tool.name, { ...tool, _source: 'inferred' });
    }
  }

  return [...byName.values()];
}

/**
 * Compute the security tier for a tool based on category and name.
 *
 * Tier 0 (Safe): page-state, media (read ops)
 * Tier 1 (Navigation): navigation, search, schema-org search
 * Tier 2 (Mutation): form, auth, ecommerce, richtext, file-upload, social-action
 */
export function getSecurityTier(tool: Tool): SecurityTier {
  const cat: ToolCategory | undefined = tool.category;
  const name: string = tool.name;

  // Safe
  if (cat === 'page-state') return SecurityTierLevel.SAFE;
  if (cat === 'media') return SecurityTierLevel.SAFE;

  // Navigation
  if (cat === 'navigation') return SecurityTierLevel.NAVIGATION;
  if (cat === 'schema-org' && name.includes('search')) return SecurityTierLevel.NAVIGATION;

  // Mutations
  if (cat === 'form') return SecurityTierLevel.MUTATION;
  if (cat === 'auth') return SecurityTierLevel.MUTATION;
  if (cat === 'ecommerce') return SecurityTierLevel.MUTATION;
  if (cat === 'richtext') return SecurityTierLevel.MUTATION;
  if (cat === 'file-upload') return SecurityTierLevel.MUTATION;
  if (cat === 'social-action') return SecurityTierLevel.MUTATION;
  if (cat === 'interactive' && name.includes('.toggle-')) return SecurityTierLevel.MUTATION;
  if (cat === 'search') return SecurityTierLevel.NAVIGATION;

  // Default: navigation-level (cautious but not blocking)
  return SecurityTierLevel.NAVIGATION;
}
