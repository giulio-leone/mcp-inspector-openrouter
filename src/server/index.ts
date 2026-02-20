import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";

const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;

// Internal state to hold tools provided by the Chrome extension
let dynamicPageTools: Tool[] = [];

// Track the current Chrome extension connection
let activeExtensionConnection: WebSocket | null = null;
let callToolResolvers = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

// 1. Initialize MCP Server
const mcpServer = new Server({
    name: "mcp-inspector-browser-bridge",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {
            listChanged: true, // Crucial: Allows us to notify clients when tools change
        },
    },
});

// 2. Setup MCP Request Handlers

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: dynamicPageTools,
    };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!activeExtensionConnection) {
        throw new Error("No active browser extension connected to forward the tool call.");
    }

    // Generate a unique ID for this call
    const callId = Math.random().toString(36).substring(2, 15);

    return new Promise((resolve, reject) => {
        // Store resolver to handle the response from WebSocket later
        callToolResolvers.set(callId, { resolve, reject });

        // Set a timeout
        setTimeout(() => {
            if (callToolResolvers.has(callId)) {
                callToolResolvers.delete(callId);
                reject(new Error(`Tool call ${name} timed out after 30 seconds.`));
            }
        }, 30000);

        // Forward the call to the Chrome extension
        activeExtensionConnection!.send(JSON.stringify({
            type: "CALL_TOOL",
            callId,
            name,
            args
        }));
    });
});


// 3. Setup WebSocket Server

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
    console.error(`[WS] Chrome Extension connected on port ${WS_PORT}`);
    activeExtensionConnection = ws;

    ws.on("message", async (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (message.type === "TOOLS_UPDATED") {
                console.error(`[WS] Received updated tools from browser: ${message.tools?.length || 0} tools.`);
                dynamicPageTools = message.tools || [];

                // Notify MCP clients that tools have changed
                await mcpServer.notification({
                    method: "notifications/tools/list_changed"
                });
            } else if (message.type === "TOOL_RESPONSE") {
                console.error(`[WS] Received response for tool call ${message.callId}`);
                const resolver = callToolResolvers.get(message.callId);
                if (resolver) {
                    if (message.error) {
                        resolver.reject(new Error(message.error));
                    } else {
                        resolver.resolve(message.result);
                    }
                    callToolResolvers.delete(message.callId);
                }
            }
        } catch (e) {
            console.error("[WS] Error parsing message from extension", e);
        }
    });

    ws.on("close", async () => {
        console.error(`[WS] Chrome Extension disconnected.`);
        if (activeExtensionConnection === ws) {
            activeExtensionConnection = null;
            dynamicPageTools = [];
            // Notify MCP clients that tools are gone
            try {
                await mcpServer.notification({
                    method: "notifications/tools/list_changed"
                });
            } catch (e) {
                // server might be closing
            }
        }
    });
});

wss.on("listening", () => {
    console.error(`[WS] WebSocket server listening on ws://localhost:${WS_PORT}`);
});


// 4. Start MCP Stdio Transport

async function run() {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("[MCP] Server is running via stdio");
}

run().catch((error) => {
    console.error("[MCP] Failed to start server:", error);
    process.exit(1);
});
