/**
 * AI Classifier — sends low-confidence tools to an LLM for refined
 * categorisation.  Communicates with the background service worker
 * via chrome.runtime messages (AI_CLASSIFY action).
 */

import type {
  Tool,
  AIClassifierPageContext,
  AIClassificationResult,
  AIClassifyResponse,
} from '../types';
import { AI_CLASSIFIER_CONFIG } from '../utils/constants';

interface CacheEntry {
  result: Tool;
  ts: number;
}

export class AIClassifier {
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Classify a batch of ambiguous tools via AI.
   * Returns enhanced tools with AI-refined metadata.
   */
  async classifyElements(
    tools: Tool[],
    pageContext: AIClassifierPageContext,
  ): Promise<Tool[]> {
    if (tools.length === 0) return [];

    const uncached: Tool[] = [];
    const cachedResults: Tool[] = [];

    for (const tool of tools) {
      const key = this.cacheKey(tool);
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.ts < AI_CLASSIFIER_CONFIG.cacheTTL) {
        cachedResults.push(cached.result);
      } else {
        uncached.push(tool);
      }
    }

    if (uncached.length === 0) {
      console.debug('[WMCP-AI] All elements served from cache');
      return cachedResults;
    }

    const allResults: Tool[] = [...cachedResults];

    for (
      let i = 0;
      i < uncached.length;
      i += AI_CLASSIFIER_CONFIG.batchSize
    ) {
      const batch = uncached.slice(i, i + AI_CLASSIFIER_CONFIG.batchSize);
      try {
        const results = await this.classifyBatch(batch, pageContext);
        results.forEach((result, idx) => {
          const key = this.cacheKey(batch[idx]);
          this.cache.set(key, { result, ts: Date.now() });
        });
        allResults.push(...results);
      } catch (e) {
        console.warn('[WMCP-AI] Batch classification failed:', e);
        allResults.push(...batch);
      }
    }

    return allResults;
  }

  // ── Private helpers ──

  private async classifyBatch(
    tools: Tool[],
    pageContext: AIClassifierPageContext,
  ): Promise<Tool[]> {
    const prompt = this.buildPrompt(tools, pageContext);

    const response = await new Promise<AIClassifyResponse>(
      (resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: 'AI_CLASSIFY',
            model: AI_CLASSIFIER_CONFIG.model,
            prompt,
          },
          (resp: AIClassifyResponse) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (resp?.error) {
              reject(new Error(resp.error));
            } else {
              resolve(resp);
            }
          },
        );
      },
    );

    return this.parseResponse(response.text ?? '', tools);
  }

  private buildPrompt(
    tools: Tool[],
    pageContext: AIClassifierPageContext,
  ): string {
    const elements = tools
      .map((t, i) => {
        const conf = (t.confidence ?? 0).toFixed(2);
        return `[${i}] name="${t.name}" | category="${t.category ?? ''}" | description="${t.description}" | confidence=${conf}`;
      })
      .join('\n');

    return `You are a web element classifier for the WebMCP protocol.

Page: ${pageContext.url}
Title: ${pageContext.title}

I have ${tools.length} DOM elements that my heuristic scanner couldn't confidently classify.
For each element, provide a refined classification.

Elements:
${elements}

Respond with a JSON array of objects, one per element, in the same order:
[
  {
    "index": 0,
    "name": "category.action-slug",
    "description": "Better description of what this element does",
    "category": "one of: form|navigation|search|interactive|media|ecommerce|auth|page-state|schema-org|richtext|file-upload|social-action",
    "confidence": 0.85
  }
]

Rules:
- Use MCP dot notation for names: category.action-slug (e.g. form.submit-login, richtext.compose-post)
- Confidence should reflect how certain you are (0.7-1.0)
- richtext = contenteditable / WYSIWYG editors / social media post composers
- file-upload = file inputs, drop zones, upload buttons
- social-action = like, share, follow, comment, repost buttons
- If unsure, keep the original values but raise confidence slightly
- Only return the JSON array, no other text`;
  }

  private parseResponse(text: string, originalTools: Tool[]): Tool[] {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('[WMCP-AI] Could not extract JSON from response');
        return originalTools;
      }

      const parsed: AIClassificationResult[] = JSON.parse(jsonMatch[0]);
      return originalTools.map((tool, idx) => {
        const refined = parsed.find((r) => r.index === idx);
        if (!refined) return tool;

        return {
          ...tool,
          name: refined.name || tool.name,
          description: refined.description || tool.description,
          category: refined.category || tool.category,
          confidence: refined.confidence || tool.confidence,
          _aiRefined: true,
        };
      });
    } catch (e) {
      console.warn('[WMCP-AI] Failed to parse AI response:', e);
      return originalTools;
    }
  }

  private cacheKey(tool: Tool): string {
    return `${tool.name}::${tool.category ?? ''}::${location.href}`;
  }
}
