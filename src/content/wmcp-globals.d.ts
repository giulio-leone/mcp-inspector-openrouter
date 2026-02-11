/**
 * Global type augmentations for the WebMCP content script environment.
 */

/** WebMCP native API exposed on navigator by the browser */
interface ModelContextTesting {
  listTools(): WebMCPNativeTool[];
  executeTool(name: string, args: string): Promise<unknown>;
  getCrossDocumentScriptToolResult(): Promise<unknown>;
  registerToolsChangedCallback?(callback: () => void): void;
}

/** Tool shape returned by the native WebMCP API */
interface WebMCPNativeTool {
  name: string;
  description: string;
  inputSchema: string;
}

declare global {
  interface Navigator {
    modelContextTesting?: ModelContextTesting;
  }

  interface Window {
    __wmcp_loaded?: boolean;
  }
}

export {};
