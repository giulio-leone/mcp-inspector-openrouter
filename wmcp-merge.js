/**
 * WMCP Merge Utilities
 * Merges tools from 3 tiers: Native > Declarative > Inferred
 * Union-dedup strategy: native wins on name collision
 */

/**
 * Merge tool sets from all tiers.
 * Priority: native > declarative > inferred (for name collisions)
 * @returns {object[]} Merged, deduplicated tool array
 */
function mergeToolSets(nativeTools, declarativeTools, inferredTools) {
    const byName = new Map();

    // 1st priority: Native tools
    for (const tool of nativeTools) {
        byName.set(tool.name, { ...tool, _source: 'native' });
    }

    // 2nd priority: Declarative tools (only if name not already taken)
    for (const tool of declarativeTools) {
        if (!byName.has(tool.name)) {
            byName.set(tool.name, { ...tool, _source: 'declarative' });
        }
    }

    // 3rd priority: Inferred tools (only if name not already taken)
    for (const tool of inferredTools) {
        if (!byName.has(tool.name)) {
            byName.set(tool.name, { ...tool, _source: 'inferred' });
        }
    }

    return [...byName.values()];
}

/**
 * Security classification for inferred tool actions.
 * Tier 0: SAFE — read-only, scroll, read state
 * Tier 1: NAVIGATION — opens links, switches tabs
 * Tier 2: MUTATION — form submit, click buy, login
 */
const SECURITY_TIERS = {
    0: { label: 'Safe', autoExecute: true },
    1: { label: 'Navigation', autoExecute: true },
    2: { label: 'Mutation', autoExecute: false } // requires confirm in v2
};

function getSecurityTier(tool) {
    const cat = tool.category;
    const name = tool.name;

    // Safe actions
    if (cat === 'page-state') return 0;
    if (cat === 'media') return 0;

    // Navigation
    if (cat === 'navigation') return 1;
    if (cat === 'schema-org' && name.includes('search')) return 1;

    // Mutations
    if (cat === 'form') return 2;
    if (cat === 'auth') return 2;
    if (cat === 'ecommerce') return 2;
    if (cat === 'interactive' && name.startsWith('toggle-')) return 2;
    if (cat === 'search') return 1;

    // Default: navigation-level (cautious but not blocking)
    return 1;
}

// Export for content.js
window.__wmcpMerge = { mergeToolSets, getSecurityTier, SECURITY_TIERS };
