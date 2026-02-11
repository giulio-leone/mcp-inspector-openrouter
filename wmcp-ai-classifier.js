/**
 * WMCP AI Classifier
 * Uses a lightweight LLM (via OpenRouter) to classify ambiguous DOM elements
 * that the heuristic scanner couldn't confidently categorize.
 *
 * Runs in the content script; delegates API calls to the background service worker.
 */

const AI_CLASSIFIER_CONFIG = {
    confidenceThreshold: 0.65, // below this → trigger AI
    batchSize: 15,             // max elements per batch request
    model: 'google/gemini-2.0-flash-lite-001', // fast + cheap
    cacheTTL: 5 * 60 * 1000,  // 5 min cache
};

class WMCPAIClassifier {
    constructor() {
        this.cache = new Map(); // elementKey → classification result
    }

    /**
     * Classify a batch of ambiguous tools via AI.
     * @param {object[]} tools - Tools with low confidence from heuristic scan
     * @param {object} pageContext - { url, title }
     * @returns {object[]} Enhanced tools with AI-refined metadata
     */
    async classifyElements(tools, pageContext) {
        if (tools.length === 0) return [];

        // Check cache first
        const uncached = [];
        const cachedResults = [];
        for (const tool of tools) {
            const key = this._cacheKey(tool);
            const cached = this.cache.get(key);
            if (cached && (Date.now() - cached.ts < AI_CLASSIFIER_CONFIG.cacheTTL)) {
                cachedResults.push(cached.result);
            } else {
                uncached.push(tool);
            }
        }

        if (uncached.length === 0) {
            console.debug('[WMCP-AI] All elements served from cache');
            return cachedResults;
        }

        // Batch in chunks
        const allResults = [...cachedResults];
        for (let i = 0; i < uncached.length; i += AI_CLASSIFIER_CONFIG.batchSize) {
            const batch = uncached.slice(i, i + AI_CLASSIFIER_CONFIG.batchSize);
            try {
                const results = await this._classifyBatch(batch, pageContext);
                // Cache results
                results.forEach((result, idx) => {
                    const key = this._cacheKey(batch[idx]);
                    this.cache.set(key, { result, ts: Date.now() });
                });
                allResults.push(...results);
            } catch (e) {
                console.warn('[WMCP-AI] Batch classification failed:', e);
                // Return original tools unchanged on failure
                allResults.push(...batch);
            }
        }

        return allResults;
    }

    /**
     * Send a batch of elements to the AI for classification.
     * Communicates with background.js which has access to the API key.
     */
    async _classifyBatch(tools, pageContext) {
        const prompt = this._buildPrompt(tools, pageContext);

        // Send to background script for API call
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    action: 'AI_CLASSIFY',
                    model: AI_CLASSIFIER_CONFIG.model,
                    prompt: prompt
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response?.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response);
                    }
                }
            );
        });

        // Parse AI response
        return this._parseResponse(response.text, tools);
    }

    /**
     * Build the classification prompt for the AI.
     */
    _buildPrompt(tools, pageContext) {
        const elementsDescription = tools.map((t, i) => {
            return `[${i}] name="${t.name}" | category="${t.category}" | description="${t.description}" | confidence=${t.confidence.toFixed(2)}`;
        }).join('\n');

        return `You are a web element classifier for the WebMCP protocol.

Page: ${pageContext.url}
Title: ${pageContext.title}

I have ${tools.length} DOM elements that my heuristic scanner couldn't confidently classify.
For each element, provide a refined classification.

Elements:
${elementsDescription}

Respond with a JSON array of objects, one per element, in the same order:
[
  {
    "index": 0,
    "name": "refined-tool-name",
    "description": "Better description of what this element does",
    "category": "one of: form|navigation|search|interactive|media|ecommerce|auth|page-state|schema-org",
    "confidence": 0.85
  }
]

Rules:
- Keep the name slug-friendly (lowercase, hyphens, no spaces)
- Confidence should reflect how certain you are (0.7-1.0)
- If unsure, keep the original values but raise confidence slightly
- Only return the JSON array, no other text`;
    }

    /**
     * Parse the AI response and merge with original tools.
     */
    _parseResponse(text, originalTools) {
        try {
            // Extract JSON from potential markdown code blocks
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.warn('[WMCP-AI] Could not extract JSON from response');
                return originalTools;
            }

            const parsed = JSON.parse(jsonMatch[0]);
            return originalTools.map((tool, idx) => {
                const refined = parsed.find(r => r.index === idx);
                if (!refined) return tool;

                return {
                    ...tool,
                    name: refined.name || tool.name,
                    description: refined.description || tool.description,
                    category: refined.category || tool.category,
                    confidence: refined.confidence || tool.confidence,
                    _aiRefined: true
                };
            });
        } catch (e) {
            console.warn('[WMCP-AI] Failed to parse AI response:', e);
            return originalTools;
        }
    }

    _cacheKey(tool) {
        return `${tool.name}::${tool.category}::${location.href}`;
    }
}

// Export singleton
window.__wmcpAIClassifier = new WMCPAIClassifier();
window.__wmcpAIClassifierConfig = AI_CLASSIFIER_CONFIG;
