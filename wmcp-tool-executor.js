/**
 * WMCP Tool Executor
 * Executes inferred tools by Strategy Pattern — each category has its own execution logic.
 */

const WMCPExecutor = {
    /**
     * Execute an inferred tool.
     * @param {object} tool - The inferred tool object (with ._el reference)
     * @param {object} args - Parsed input arguments
     * @returns {string} Execution result description
     */
    async execute(tool, args) {
        const strategy = this.strategies[tool.category];
        if (!strategy) {
            throw new Error(`[WMCP-Executor] No strategy for category "${tool.category}"`);
        }
        console.debug(`[WMCP-Executor] Executing "${tool.name}" (${tool.category})`);
        return strategy(tool, args);
    },

    strategies: {
        // ── FORM ──
        form(tool, args) {
            const form = tool._el;
            if (!form) throw new Error('Form element not found');

            const parsed = typeof args === 'string' ? JSON.parse(args) : args;
            for (const [key, value] of Object.entries(parsed)) {
                const input = form.querySelector(`[name="${key}"], #${key}`);
                if (input) {
                    if (input.tagName === 'SELECT') {
                        const opt = [...input.options].find(o =>
                            o.value.toLowerCase() === String(value).toLowerCase()
                        );
                        if (opt) input.value = opt.value;
                    } else if (input.type === 'checkbox') {
                        input.checked = !!value;
                    } else if (input.type === 'radio') {
                        const radio = form.querySelector(`input[type="radio"][name="${key}"][value="${value}"]`);
                        if (radio) radio.checked = true;
                    } else {
                        input.value = value;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            return `Form "${tool.name}" submitted with ${Object.keys(parsed).length} fields`;
        },

        // ── NAVIGATION ──
        navigation(tool) {
            const link = tool._el;
            if (!link) throw new Error('Navigation link not found');
            const href = link.getAttribute('href');
            if (href) {
                link.click();
                return `Navigated to: ${href}`;
            }
            throw new Error('No href found');
        },

        // ── SEARCH ──
        search(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('Search input not found');

            const parsed = typeof args === 'string' ? JSON.parse(args) : args;
            const query = parsed.query || '';

            el.value = query;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));

            // Try submitting parent form
            const form = tool._form || el.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            } else {
                // Simulate Enter key
                el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            }

            return `Searched for: "${query}"`;
        },

        // ── INTERACTIVE (click, tab, toggle, combobox) ──
        interactive(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('Interactive element not found');

            // Toggle
            if (tool.name.startsWith('toggle-')) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : (args || {});
                if (el.type === 'checkbox' || el.getAttribute('role') === 'switch') {
                    const desired = parsed.checked !== undefined ? !!parsed.checked : !el.checked;
                    if (el.checked !== desired) el.click();
                    return `Toggled "${tool.name}" to ${desired ? 'ON' : 'OFF'}`;
                }
            }

            // Select option (combobox / listbox)
            if (tool.name.startsWith('select-') && args) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                const value = parsed.value;
                if (value) {
                    const option = el.querySelector(`[role="option"]`);
                    // Open combo first
                    el.click();
                    setTimeout(() => {
                        const opts = [...document.querySelectorAll('[role="option"]')];
                        const match = opts.find(o => o.textContent.trim().toLowerCase() === value.toLowerCase());
                        if (match) match.click();
                    }, 100);
                    return `Selected "${value}" from ${tool.name}`;
                }
            }

            // Default: click
            el.click();
            return `Clicked: ${tool.name}`;
        },

        // ── MEDIA ──
        media(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('Media element not found');

            if (tool.name.startsWith('play-')) {
                el.play();
                return `Playing: ${tool.description}`;
            }
            if (tool.name.startsWith('pause-')) {
                el.pause();
                return `Paused: ${tool.description}`;
            }
            if (tool.name.startsWith('seek-')) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                el.currentTime = parsed.time || 0;
                return `Seeked to ${parsed.time}s: ${tool.description}`;
            }

            return 'Unknown media action';
        },

        // ── E-COMMERCE ──
        ecommerce(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('E-commerce element not found');

            if (tool.name.startsWith('add-to-cart-')) {
                el.click();
                return `Added to cart: ${tool.description}`;
            }

            if (tool.name.startsWith('set-quantity-')) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                el.value = parsed.quantity || 1;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return `Set quantity to ${parsed.quantity}`;
            }

            el.click();
            return `E-commerce action: ${tool.name}`;
        },

        // ── AUTH ──
        auth(tool, args) {
            if (tool.name === 'login') {
                const form = tool._el;
                if (!form) throw new Error('Login form not found');
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                for (const [key, value] of Object.entries(parsed)) {
                    const input = form.querySelector(`[name="${key}"], #${key}`);
                    if (input) {
                        input.value = value;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                return 'Login form submitted';
            }

            if (tool.name === 'logout') {
                const el = tool._el;
                if (el) el.click();
                return 'Logout clicked';
            }

            throw new Error(`Unknown auth tool: ${tool.name}`);
        },

        // ── PAGE STATE ──
        'page-state'(tool) {
            if (tool.name === 'scroll-to-top') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return 'Scrolled to top';
            }
            if (tool.name === 'scroll-to-bottom') {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                return 'Scrolled to bottom';
            }
            if (tool.name === 'toggle-theme' || tool.name === 'click-back-to-top') {
                const el = tool._el;
                if (el) el.click();
                return `Executed: ${tool.name}`;
            }
            return 'Unknown page state action';
        },

        // ── SCHEMA.ORG ──
        'schema-org'(tool, args) {
            const action = tool._schemaAction;
            if (!action || !action.target) throw new Error('No Schema.org target');

            let url = typeof action.target === 'string'
                ? action.target
                : action.target.urlTemplate || action.target.url || '';

            if (args) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                for (const [key, value] of Object.entries(parsed)) {
                    url = url.replace(`{${key}}`, encodeURIComponent(value));
                }
            }

            if (url) {
                window.location.href = url;
                return `Navigating to Schema.org action: ${url}`;
            }

            throw new Error('Could not resolve Schema.org action URL');
        }
    }
};

window.__wmcpExecutor = WMCPExecutor;
