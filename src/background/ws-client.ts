import type { CleanTool } from '../types';

export class BridgeWebSocketClient {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private currentTools: readonly CleanTool[] = [];

    constructor(url = 'ws://localhost:8080') {
        this.url = url;
        this.connect();
    }

    private connect() {
        console.debug(`[BridgeWS] Connecting to ${this.url}...`);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.debug('[BridgeWS] Connected to bridge server.');
            // Send the latest tools we have, just in case
            this.sendToolsUpdate(this.currentTools);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'CALL_TOOL') {
                    this.handleCallTool(message);
                }
            } catch (e) {
                console.error('[BridgeWS] Error parsing message:', e);
            }
        };

        this.ws.onclose = () => {
            console.debug('[BridgeWS] Disconnected. Reconnecting in 3s...');
            this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[BridgeWS] WebSocket error:', err);
            this.ws?.close();
        };
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 3000);
    }

    public updateTools(tools: readonly CleanTool[]) {
        this.currentTools = tools;
        this.sendToolsUpdate(tools);
    }

    private sendToolsUpdate(tools: readonly CleanTool[]) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'TOOLS_UPDATED',
                tools: tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema
                }))
            }));
        }
    }

    private async handleCallTool(message: { callId: string; name: string; args: any }) {
        console.debug(`[BridgeWS] Received TOOL_CALL for ${message.name}`);
        try {
            // Find the active tab to execute the tool
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
                throw new Error('No active tab found to execute tool.');
            }

            // We send a message to the content script in the active tab
            const result = await chrome.tabs.sendMessage(tab.id, {
                action: 'EXECUTE_TOOL',
                name: message.name,
                inputArgs: message.args
            });

            this.sendResponse(message.callId, result);
        } catch (e) {
            console.error(`[BridgeWS] Error executing tool:`, e);
            this.sendError(message.callId, e instanceof Error ? e.message : String(e));
        }
    }

    private sendResponse(callId: string, result: any) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'TOOL_RESPONSE',
                callId,
                result
            }));
        }
    }

    private sendError(callId: string, error: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'TOOL_RESPONSE',
                callId,
                error
            }));
        }
    }
}
