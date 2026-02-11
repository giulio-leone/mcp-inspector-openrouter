/**
 * WMCP Auto-Inference Engine
 * Scans the DOM across 9 categories to discover actionable tools.
 * Each tool has: name, description, category, inputSchema, confidence, _source:'inferred'
 */

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function slugify(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
}

function getLabel(el) {
    // 1. aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    // 2. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const ref = document.getElementById(labelledBy);
        if (ref) return ref.textContent.trim();
    }
    // 3. <label> with for= matching id
    if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) return lbl.textContent.trim();
    }
    // 4. title attribute
    if (el.title) return el.title.trim();
    // 5. placeholder
    if (el.placeholder) return el.placeholder.trim();
    // 6. innerText (capped)
    const txt = el.textContent?.trim();
    if (txt && txt.length < 80) return txt;
    return '';
}

function computeConfidence(signals) {
    // signals: { hasAria, hasLabel, hasName, isVisible, hasRole, hasSemanticTag }
    let score = 0.4; // baseline
    if (signals.hasAria) score += 0.15;
    if (signals.hasLabel) score += 0.15;
    if (signals.hasName) score += 0.1;
    if (signals.hasRole) score += 0.1;
    if (signals.hasSemanticTag) score += 0.1;
    if (signals.isVisible === false) score -= 0.2;
    return Math.min(1, Math.max(0, score));
}

function isVisible(el) {
    if (!el.offsetParent && el.style?.display !== 'fixed') return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function makeInputSchema(fields) {
    const props = {};
    const required = [];
    for (const f of fields) {
        const prop = { type: f.type || 'string' };
        if (f.description) prop.description = f.description;
        if (f.enum) prop.enum = f.enum;
        if (f.default !== undefined) prop.default = f.default;
        props[f.name] = prop;
        if (f.required) required.push(f.name);
    }
    return JSON.stringify({
        type: 'object',
        properties: props,
        ...(required.length ? { required } : {})
    });
}

/**
 * Recursively collect open Shadow DOM roots from a root element.
 * Returns an array of shadowRoot nodes that can be scanned.
 */
function collectShadowRoots(root, maxDepth = 5) {
    const roots = [];
    if (maxDepth <= 0) return roots;
    const walk = (node, depth) => {
        if (depth > maxDepth) return;
        if (node.shadowRoot) {
            roots.push(node.shadowRoot);
            walk(node.shadowRoot, depth + 1);
        }
        const children = node.children || node.querySelectorAll?.('*') || [];
        for (const child of children) {
            if (child.shadowRoot) {
                roots.push(child.shadowRoot);
                walk(child.shadowRoot, depth + 1);
            }
        }
    };
    walk(root, 0);
    return roots;
}

// ──────────────────────────────────────────────
// 1. FORMS (non-WMCP native)
// ──────────────────────────────────────────────

function extractFormTools(root) {
    const tools = [];
    // Only infer from forms that DON'T already have toolname (those are declarative)
    const forms = root.querySelectorAll('form:not([toolname])');

    for (const form of forms) {
        const name = slugify(
            form.getAttribute('aria-label') ||
            form.id ||
            form.action?.split('/').pop() ||
            'form'
        ) || 'unnamed-form';

        const inputs = form.querySelectorAll('input, select, textarea');
        if (inputs.length === 0) continue;

        const fields = [];
        for (const inp of inputs) {
            if (inp.type === 'hidden' || inp.type === 'submit') continue;
            const fieldName = inp.name || inp.id || slugify(getLabel(inp)) || 'field';
            const field = {
                name: fieldName,
                type: inp.type === 'number' ? 'number' : 'string',
                description: getLabel(inp),
                required: inp.required || inp.getAttribute('aria-required') === 'true'
            };
            // Enums for select/radio
            if (inp.tagName === 'SELECT') {
                field.enum = [...inp.options].map(o => o.value).filter(Boolean);
            }
            fields.push(field);
        }

        // Radio groups
        const radioGroups = new Map();
        for (const radio of form.querySelectorAll('input[type="radio"]')) {
            const gName = radio.name || 'radio';
            if (!radioGroups.has(gName)) radioGroups.set(gName, []);
            radioGroups.get(gName).push(radio.value);
        }
        for (const [gName, vals] of radioGroups) {
            // Remove duplicate individual radio entries
            const idx = fields.findIndex(f => f.name === gName);
            if (idx >= 0) fields.splice(idx, 1);
            fields.push({ name: gName, type: 'string', enum: vals });
        }

        if (fields.length === 0) continue;

        const hasAriaLabel = !!form.getAttribute('aria-label');
        tools.push({
            name: `submit-${name}`,
            description: `Submit form: ${getLabel(form) || name}`,
            category: 'form',
            inputSchema: makeInputSchema(fields),
            confidence: computeConfidence({
                hasAria: hasAriaLabel,
                hasLabel: !!getLabel(form),
                hasName: !!form.id,
                isVisible: isVisible(form),
                hasRole: false,
                hasSemanticTag: true
            }),
            _source: 'inferred',
            _el: form
        });
    }
    return tools;
}

// ──────────────────────────────────────────────
// 2. NAVIGATION
// ──────────────────────────────────────────────

function extractNavigationTools(root) {
    const tools = [];
    // <nav> links
    const navLinks = root.querySelectorAll('nav a[href], [role="navigation"] a[href]');
    for (const link of navLinks) {
        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:')) continue;
        const label = getLabel(link) || link.textContent.trim();
        if (!label) continue;

        tools.push({
            name: `navigate-${slugify(label)}`,
            description: `Navigate to: ${label}`,
            category: 'navigation',
            inputSchema: makeInputSchema([]),
            confidence: computeConfidence({
                hasAria: !!link.getAttribute('aria-label'),
                hasLabel: true,
                hasName: true,
                isVisible: isVisible(link),
                hasRole: true,
                hasSemanticTag: true
            }),
            _source: 'inferred',
            _el: link
        });
    }
    return tools;
}

// ──────────────────────────────────────────────
// 3. SEARCH
// ──────────────────────────────────────────────

function extractSearchTools(root) {
    const tools = [];
    const searchInputs = root.querySelectorAll(
        'input[type="search"], [role="search"] input, input[name*="search" i], input[name*="query" i], input[name="q"], input[name="s"]'
    );

    for (const inp of searchInputs) {
        const form = inp.closest('form');
        // Skip if parent form already captured
        const name = slugify(
            inp.getAttribute('aria-label') ||
            inp.placeholder ||
            'search'
        );

        tools.push({
            name: `search-${name}`,
            description: `Search: ${getLabel(inp) || 'site search'}`,
            category: 'search',
            inputSchema: makeInputSchema([{
                name: 'query',
                type: 'string',
                description: 'Search query',
                required: true
            }]),
            confidence: computeConfidence({
                hasAria: !!inp.getAttribute('aria-label'),
                hasLabel: !!getLabel(inp),
                hasName: true,
                isVisible: isVisible(inp),
                hasRole: !!inp.closest('[role="search"]'),
                hasSemanticTag: inp.type === 'search'
            }),
            _source: 'inferred',
            _el: inp,
            _form: form
        });
    }
    return tools;
}

// ──────────────────────────────────────────────
// 4. INTERACTIVE CONTROLS (buttons, toggles, tabs)
// ──────────────────────────────────────────────

function extractInteractiveTools(root) {
    const tools = [];

    // Buttons (not inside forms already captured)
    const buttons = root.querySelectorAll(
        'button:not(form[toolname] button), [role="button"], input[type="button"]'
    );
    for (const btn of buttons) {
        // Skip form submit buttons inside non-toolname forms (handled by form scanner)
        if (btn.type === 'submit' && btn.closest('form:not([toolname])')) continue;
        const label = getLabel(btn);
        if (!label) continue;

        tools.push({
            name: `click-${slugify(label)}`,
            description: `Click: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([]),
            confidence: computeConfidence({
                hasAria: !!btn.getAttribute('aria-label'),
                hasLabel: true,
                hasName: !!btn.id,
                isVisible: isVisible(btn),
                hasRole: btn.getAttribute('role') === 'button' || btn.tagName === 'BUTTON',
                hasSemanticTag: btn.tagName === 'BUTTON'
            }),
            _source: 'inferred',
            _el: btn
        });
    }

    // Tabs
    const tabs = root.querySelectorAll('[role="tab"]');
    for (const tab of tabs) {
        const label = getLabel(tab);
        if (!label) continue;
        tools.push({
            name: `select-tab-${slugify(label)}`,
            description: `Select tab: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([]),
            confidence: 0.85,
            _source: 'inferred',
            _el: tab
        });
    }

    // Toggle switches / checkboxes acting as switches
    const toggles = root.querySelectorAll(
        '[role="switch"], input[type="checkbox"][role="switch"]'
    );
    for (const toggle of toggles) {
        const label = getLabel(toggle);
        if (!label) continue;
        tools.push({
            name: `toggle-${slugify(label)}`,
            description: `Toggle: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([{
                name: 'checked',
                type: 'boolean',
                description: 'Desired state'
            }]),
            confidence: 0.9,
            _source: 'inferred',
            _el: toggle
        });
    }

    // Dropdowns / comboboxes
    const combos = root.querySelectorAll('[role="combobox"], [role="listbox"]');
    for (const combo of combos) {
        const label = getLabel(combo);
        if (!label) continue;
        const options = [...combo.querySelectorAll('[role="option"]')].map(
            o => o.textContent.trim()
        );
        tools.push({
            name: `select-${slugify(label)}`,
            description: `Select option from: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([{
                name: 'value',
                type: 'string',
                description: 'Option to select',
                ...(options.length ? { enum: options } : {})
            }]),
            confidence: 0.85,
            _source: 'inferred',
            _el: combo
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 5. MEDIA
// ──────────────────────────────────────────────

function extractMediaTools(root) {
    const tools = [];

    const videos = root.querySelectorAll('video');
    for (const video of videos) {
        const label = getLabel(video) || video.getAttribute('aria-label') || 'video';
        const id = slugify(video.id || label);

        tools.push({
            name: `play-${id}`,
            description: `Play video: ${label}`,
            category: 'media',
            inputSchema: makeInputSchema([]),
            confidence: 0.9,
            _source: 'inferred',
            _el: video
        });

        tools.push({
            name: `pause-${id}`,
            description: `Pause video: ${label}`,
            category: 'media',
            inputSchema: makeInputSchema([]),
            confidence: 0.9,
            _source: 'inferred',
            _el: video
        });

        if (video.duration) {
            tools.push({
                name: `seek-${id}`,
                description: `Seek video to time: ${label}`,
                category: 'media',
                inputSchema: makeInputSchema([{
                    name: 'time',
                    type: 'number',
                    description: 'Time in seconds'
                }]),
                confidence: 0.85,
                _source: 'inferred',
                _el: video
            });
        }
    }

    const audios = root.querySelectorAll('audio');
    for (const audio of audios) {
        const label = getLabel(audio) || 'audio';
        const id = slugify(audio.id || label);
        tools.push({
            name: `play-audio-${id}`,
            description: `Play audio: ${label}`,
            category: 'media',
            inputSchema: makeInputSchema([]),
            confidence: 0.9,
            _source: 'inferred',
            _el: audio
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 6. E-COMMERCE
// ──────────────────────────────────────────────

function extractEcommerceTools(root) {
    const tools = [];

    // Add to cart buttons
    const addToCart = root.querySelectorAll(
        '[data-action="add-to-cart"], button[class*="add-to-cart" i], button[id*="add-to-cart" i], ' +
        'button[aria-label*="add to cart" i], [data-mcp-type="add-to-cart"]'
    );
    for (const btn of addToCart) {
        const product = btn.closest('[itemtype*="Product"], [data-product-id], .product');
        const productName = product?.querySelector('[itemprop="name"]')?.textContent?.trim() || '';
        const productId = product?.dataset?.productId || slugify(productName) || 'item';

        tools.push({
            name: `add-to-cart-${slugify(productId)}`,
            description: `Add to cart: ${productName || productId}`,
            category: 'ecommerce',
            inputSchema: makeInputSchema([{
                name: 'quantity',
                type: 'number',
                description: 'Quantity to add',
                default: 1
            }]),
            confidence: 0.9,
            _source: 'inferred',
            _el: btn
        });
    }

    // Quantity selectors
    const qtyInputs = root.querySelectorAll(
        'input[name*="quantity" i], input[name*="qty" i], [data-mcp-type="quantity"]'
    );
    for (const inp of qtyInputs) {
        const product = inp.closest('[itemtype*="Product"], [data-product-id], .product');
        const label = product?.querySelector('[itemprop="name"]')?.textContent?.trim() || 'item';

        tools.push({
            name: `set-quantity-${slugify(label)}`,
            description: `Set quantity for: ${label}`,
            category: 'ecommerce',
            inputSchema: makeInputSchema([{
                name: 'quantity',
                type: 'number',
                description: 'Desired quantity',
                required: true
            }]),
            confidence: 0.8,
            _source: 'inferred',
            _el: inp
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 7. AUTHENTICATION
// ──────────────────────────────────────────────

function extractAuthTools(root) {
    const tools = [];

    // Login forms
    const passwordInputs = root.querySelectorAll('input[type="password"]');
    for (const pwd of passwordInputs) {
        const form = pwd.closest('form');
        if (!form || form.getAttribute('toolname')) continue; // skip native

        const emailInput = form.querySelector(
            'input[type="email"], input[name*="email" i], input[name*="user" i], input[name*="login" i]'
        );

        const fields = [];
        if (emailInput) {
            fields.push({
                name: emailInput.name || 'email',
                type: 'string',
                description: 'Email or username',
                required: true
            });
        }
        fields.push({
            name: pwd.name || 'password',
            type: 'string',
            description: 'Password',
            required: true
        });

        tools.push({
            name: 'login',
            description: 'Sign in / Log in',
            category: 'auth',
            inputSchema: makeInputSchema(fields),
            confidence: 0.95,
            _source: 'inferred',
            _el: form
        });
    }

    // Logout links/buttons
    const logoutEls = root.querySelectorAll(
        'a[href*="logout" i], a[href*="sign-out" i], a[href*="signout" i], ' +
        'button[class*="logout" i], [data-action="logout"]'
    );
    for (const el of logoutEls) {
        tools.push({
            name: 'logout',
            description: 'Sign out / Log out',
            category: 'auth',
            inputSchema: makeInputSchema([]),
            confidence: 0.9,
            _source: 'inferred',
            _el: el
        });
        break; // only one logout tool
    }

    return tools;
}

// ──────────────────────────────────────────────
// 8. PAGE STATE (scroll, print, theme)
// ──────────────────────────────────────────────

function extractPageStateTools(root) {
    const tools = [];

    // Scroll to top/bottom
    tools.push({
        name: 'scroll-to-top',
        description: 'Scroll to the top of the page',
        category: 'page-state',
        inputSchema: makeInputSchema([]),
        confidence: 1.0,
        _source: 'inferred',
        _el: null
    });

    tools.push({
        name: 'scroll-to-bottom',
        description: 'Scroll to the bottom of the page',
        category: 'page-state',
        inputSchema: makeInputSchema([]),
        confidence: 1.0,
        _source: 'inferred',
        _el: null
    });

    // Back to top button (if present, increase confidence it's relevant)
    const backToTop = root.querySelector(
        '[aria-label*="back to top" i], [class*="back-to-top" i], #back-to-top'
    );
    if (backToTop) {
        tools.push({
            name: 'click-back-to-top',
            description: 'Click the back-to-top button',
            category: 'page-state',
            inputSchema: makeInputSchema([]),
            confidence: 0.9,
            _source: 'inferred',
            _el: backToTop
        });
    }

    // Theme toggle
    const themeToggle = root.querySelector(
        '[aria-label*="dark mode" i], [aria-label*="theme" i], ' +
        'button[class*="theme" i], [data-action="toggle-theme"]'
    );
    if (themeToggle) {
        tools.push({
            name: 'toggle-theme',
            description: 'Toggle dark/light mode',
            category: 'page-state',
            inputSchema: makeInputSchema([]),
            confidence: 0.85,
            _source: 'inferred',
            _el: themeToggle
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 9. SCHEMA.ORG POTENTIAL ACTIONS
// ──────────────────────────────────────────────

function extractSchemaOrgActions(root) {
    const tools = [];

    // JSON-LD scripts
    const ldScripts = root.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
        try {
            const data = JSON.parse(script.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                if (!item.potentialAction) continue;
                const actions = Array.isArray(item.potentialAction) ? item.potentialAction : [item.potentialAction];
                for (const action of actions) {
                    const actionType = action['@type'] || 'Action';
                    const target = action.target;
                    const name = slugify(action.name || actionType);

                    const fields = [];
                    // Extract query-input if present (SearchAction pattern)
                    if (typeof target === 'object' && target['query-input']) {
                        const match = target['query-input'].match(/name=(\w+)/);
                        fields.push({
                            name: match ? match[1] : 'query',
                            type: 'string',
                            description: `Input for ${actionType}`,
                            required: true
                        });
                    } else if (typeof target === 'string' && target.includes('{')) {
                        // URL template with {placeholders}
                        const placeholders = target.match(/\{([^}]+)\}/g) || [];
                        for (const ph of placeholders) {
                            fields.push({
                                name: ph.replace(/[{}]/g, ''),
                                type: 'string',
                                description: `Parameter: ${ph.replace(/[{}]/g, '')}`,
                                required: true
                            });
                        }
                    }

                    tools.push({
                        name: `schema-${name}`,
                        description: `${actionType}: ${action.name || ''}`.trim(),
                        category: 'schema-org',
                        inputSchema: makeInputSchema(fields),
                        confidence: 0.95,
                        _source: 'inferred',
                        _el: null,
                        _schemaAction: action
                    });
                }
            }
        } catch (e) {
            // Invalid JSON-LD, skip
        }
    }

    return tools;
}

// ──────────────────────────────────────────────
// MASTER SCANNER CLASS
// ──────────────────────────────────────────────

class WMCPInferenceEngine {
    constructor() {
        this.cache = new Map(); // url → tools[]
        this.CACHE_TTL = 30000; // 30s
        this.AI_CONFIDENCE_THRESHOLD = 0.7; // below this → send to AI
        this.MIN_CONFIDENCE = 0.5; // below this → discard
    }

    /**
     * Scan the entire page across all 9 categories.
     * Low-confidence tools are auto-sent to the AI classifier for refinement.
     * Returns inferred tools array.
     */
    async scanPage(root = document) {
        // Check cache
        const cacheKey = location.href;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.ts < this.CACHE_TTL)) {
            console.debug(`[WMCP-Inference] Cache hit for ${cacheKey} (${cached.tools.length} tools)`);
            return cached.tools;
        }

        const allTools = [];

        // Run all 9 category scanners on main root
        const scanners = [
            extractFormTools, extractNavigationTools, extractSearchTools,
            extractInteractiveTools, extractMediaTools, extractEcommerceTools,
            extractAuthTools, extractPageStateTools, extractSchemaOrgActions
        ];
        for (const scanner of scanners) {
            allTools.push(...scanner(root));
        }

        // Also scan open Shadow DOM roots
        const shadowRoots = collectShadowRoots(root);
        if (shadowRoots.length > 0) {
            console.debug(`[WMCP-Inference] Found ${shadowRoots.length} open Shadow DOM root(s)`);
            for (const sr of shadowRoots) {
                for (const scanner of scanners) {
                    allTools.push(...scanner(sr));
                }
            }
        }

        // Deduplicate by name within inferred set (keep highest confidence)
        const deduped = new Map();
        for (const tool of allTools) {
            const existing = deduped.get(tool.name);
            if (!existing || tool.confidence > existing.confidence) {
                deduped.set(tool.name, tool);
            }
        }
        const final = [...deduped.values()];

        // Split into high-confidence and ambiguous
        const highConfidence = final.filter(t => t.confidence >= this.AI_CONFIDENCE_THRESHOLD);
        const ambiguous = final.filter(
            t => t.confidence >= this.MIN_CONFIDENCE && t.confidence < this.AI_CONFIDENCE_THRESHOLD
        );

        // Auto-trigger AI classifier for ambiguous tools
        let aiRefined = [];
        if (ambiguous.length > 0 && window.__wmcpAIClassifier) {
            try {
                const pageContext = {
                    url: location.href,
                    title: document.title,
                    description: document.querySelector('meta[name="description"]')?.content || ''
                };
                aiRefined = await window.__wmcpAIClassifier.classifyElements(ambiguous, pageContext);
                console.debug(
                    `[WMCP-Inference] AI refined ${aiRefined.length}/${ambiguous.length} ambiguous tools`
                );
            } catch (e) {
                console.warn('[WMCP-Inference] AI classification failed, keeping heuristic results:', e.message);
                aiRefined = ambiguous; // fallback to heuristic results
            }
        } else {
            aiRefined = ambiguous; // no classifier → keep as-is
        }

        // Merge: high-confidence + AI-refined ambiguous
        const viable = [...highConfidence, ...aiRefined];

        // Cache result
        this.cache.set(cacheKey, { tools: viable, ts: Date.now() });

        console.debug(
            `[WMCP-Inference] Scanned ${location.href}: ${viable.length} tools ` +
            `(${highConfidence.length} high + ${aiRefined.length} AI-refined)`,
            { byCategory: this._countByCategory(viable) }
        );

        return viable;
    }

    /** Invalidate cache (e.g. on DOM mutation) */
    invalidateCache() {
        this.cache.clear();
    }

    _countByCategory(tools) {
        const counts = {};
        for (const t of tools) {
            counts[t.category] = (counts[t.category] || 0) + 1;
        }
        return counts;
    }
}

// Export singleton for use in content.js
window.__wmcpInferenceEngine = new WMCPInferenceEngine();
