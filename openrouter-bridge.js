/**
 * Bridge and mock for GoogleGenAI to use OpenRouter.
 */
export class OpenRouterBridge {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.models = {
            generateContent: async (params) => {
                const response = await this._callOpenRouter(params.model, params.contents);
                return { text: response.choices[0].message.content };
            }
        };
        this.chats = {
            create: (params) => new OpenRouterChat(this, params.model)
        };
    }

    async getModels() {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || response.statusText);
        }
        const data = await response.json();
        return data.data;
    }

    async _callOpenRouter(model, contents, tools = []) {
        const messages = this._formatMessages(contents);
        const body = {
            model: model || 'google/gemini-2.0-flash-001',
            messages: messages,
        };

        if (tools && tools.length > 0) {
            body.tools = tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parametersJsonSchema
                }
            }));
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/miguelspizza/webmcp', // Optional
                'X-Title': 'Model Context Tool Inspector (OpenRouter)'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || response.statusText);
        }

        return await response.json();
    }

    _formatMessages(contents) {
        if (typeof contents === 'string') return [{ role: 'user', content: contents }];
        if (Array.isArray(contents)) {
            // Concatenate if all are strings (common for prompt building)
            if (contents.every(c => typeof c === 'string')) {
                return [{ role: 'user', content: contents.join('\n') }];
            }
            return contents.map(c => {
                if (typeof c === 'string') return { role: 'user', content: c };
                if (c.role) return c; // Already in OpenAI format?
                return { role: 'user', content: JSON.stringify(c) };
            });
        }
        return [{ role: 'user', content: JSON.stringify(contents) }];
    }
}

class OpenRouterChat {
    constructor(bridge, model) {
        this.bridge = bridge;
        this.model = model;
        this.history = [];
    }

    async sendMessage(params) {
        const { message, config } = params;

        // Convert message to OpenRouter format
        if (typeof message === 'string') {
            this.history.push({ role: 'user', content: message });
        } else if (Array.isArray(message)) {
            // tool responses
            message.forEach(m => {
                if (m.functionResponse) {
                    this.history.push({
                        role: 'tool',
                        tool_call_id: m.functionResponse.tool_call_id,
                        content: JSON.stringify(m.functionResponse.response.result || m.functionResponse.response.error)
                    });
                }
            });
        }

        const systemMessage = config?.systemInstruction ? { role: 'system', content: config.systemInstruction.join('\n') } : null;
        const tools = config?.tools?.[0]?.functionDeclarations || [];

        const body = {
            model: this.model,
            messages: systemMessage ? [systemMessage, ...this.history] : this.history,
        };

        if (tools.length > 0) {
            body.tools = tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parametersJsonSchema
                }
            }));
        }

        // Retry logic for empty responses (up to 2 retries)
        let data;
        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.bridge.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/miguelspizza/webmcp',
                    'X-Title': 'Model Context Tool Inspector (OpenRouter)'
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error.error?.message || res.statusText);
            }

            data = await res.json();

            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                break; // Valid response
            }

            // Empty response — wait and retry
            console.warn(`[OpenRouter] Empty response on attempt ${attempt + 1}/3, retrying...`);
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // If still empty after retries, throw — the system prompt instructs
        // the model to always report tool outcomes, so this shouldn't happen
        if (!data?.choices?.length || !data.choices[0].message) {
            throw new Error('OpenRouter returned no response after multiple attempts.');
        }

        const assistantMessage = data.choices[0].message;

        // Ensure content is never null in stored history (some models send null content with tool_calls)
        const historyEntry = { ...assistantMessage };
        if (historyEntry.content === null || historyEntry.content === undefined) {
            historyEntry.content = '';
        }
        this.history.push(historyEntry);

        return {
            text: assistantMessage.content || '',
            functionCalls: assistantMessage.tool_calls?.map(tc => ({
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments),
                id: tc.id
            })),
            candidates: data.choices
        };
    }
}
