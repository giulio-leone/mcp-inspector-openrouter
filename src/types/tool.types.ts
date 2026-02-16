/**
 * Tool-related types for the WebMCP extension.
 * Extracted from: content.js, wmcp-inference-engine.js, wmcp-merge.js, wmcp-tool-executor.js
 */

import type { LiveStateSnapshot } from './live-state.types';

// ── Tool Source ──

/** Origin tier of a discovered tool */
export type ToolSource = 'native' | 'declarative' | 'inferred' | 'ai' | 'manifest';

// ── Security Tiers ──

/**
 * Security classification for tool actions.
 * - 0: Safe — read-only, scroll, read state
 * - 1: Navigation — opens links, switches tabs
 * - 2: Mutation — form submit, click buy, login
 */
export type SecurityTier = 0 | 1 | 2;

/** Metadata for a security tier level */
export interface SecurityTierInfo {
  readonly label: string;
  readonly autoExecute: boolean;
}

/** Map of security tiers to their metadata */
export type SecurityTierMap = Readonly<Record<SecurityTier, SecurityTierInfo>>;

// ── Tool Categories ──

/** All 13 scanner categories from the inference engine */
export type ToolCategory =
  | 'form'
  | 'navigation'
  | 'search'
  | 'interactive'
  | 'media'
  | 'ecommerce'
  | 'auth'
  | 'page-state'
  | 'schema-org'
  | 'richtext'
  | 'file-upload'
  | 'social-action'
  | 'chatbot';

// ── Tool Schema ──

/** A single parameter in a tool's input schema */
export interface ToolParameter {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly description?: string;
  readonly required?: boolean;
  readonly enum?: readonly string[];
  readonly default?: string | number | boolean;
}

/** Property definition within a JSON Schema object */
export interface SchemaProperty {
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly default?: string | number | boolean;
}

/** JSON Schema for tool input (follows JSON Schema subset) */
export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, SchemaProperty>>;
  readonly required?: readonly string[];
}

// ── MCP Annotations ──

/** MCP-compliant tool annotations (behavior hints) */
export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

// ── Tool ──

/** A discovered tool (from any tier: native, declarative, or inferred) */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly category?: ToolCategory;
  readonly inputSchema: string | ToolInputSchema;
  readonly title?: string;
  readonly confidence?: number;
  readonly annotations?: ToolAnnotations;
  readonly _source?: ToolSource;
  readonly _aiRefined?: boolean;
  /** DOM element reference (only in content script context) */
  readonly _el?: Element | null;
  /** Parent form reference (search tools) */
  readonly _form?: HTMLFormElement | null;
  /** Schema.org action data */
  readonly _schemaAction?: SchemaOrgAction;
}

/** Schema.org PotentialAction data attached to schema-org tools */
export interface SchemaOrgAction {
  readonly '@type'?: string;
  readonly name?: string;
  readonly target?: string | SchemaOrgTarget;
}

/** Schema.org action target */
export interface SchemaOrgTarget {
  readonly urlTemplate?: string;
  readonly url?: string;
  readonly 'query-input'?: string;
}

/** Clean tool (without internal properties) sent to sidebar */
export type CleanTool = Omit<Tool, '_el' | '_form' | '_schemaAction'>;

// ── Scanner Result ──

/** Result from a single category scanner */
export interface ScannerResult {
  readonly name: ToolCategory;
  readonly tools: readonly Tool[];
}

// ── Page Context ──

/** Product info extracted from the page */
export interface ProductInfo {
  readonly id: string | null;
  readonly name: string | undefined;
  readonly price: string | undefined;
}

/** A navigation link extracted from the page */
export interface PageLink {
  readonly text: string;
  readonly href: string;
}

/** Live page context snapshot extracted by content script */
export interface PageContext {
  readonly url: string;
  readonly title: string;
  readonly products?: readonly ProductInfo[];
  readonly cartCount?: number;
  readonly formDefaults?: Readonly<Record<string, Record<string, string>>>;
  readonly formFields?: Readonly<Record<string, Record<string, string>>>;
  readonly mainHeading?: string;
  readonly pageText?: string;
  readonly headings?: readonly string[];
  readonly links?: readonly PageLink[];
  readonly metaDescription?: string;
  readonly liveState?: LiveStateSnapshot;
}

/** Page context used by the AI classifier (lighter weight) */
export interface AIClassifierPageContext {
  readonly url: string;
  readonly title: string;
  readonly description?: string;
}

// ── AI Classification Result ──

/** AI classifier result for a single element */
export interface AIClassificationResult {
  readonly index: number;
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly confidence: number;
}

/** Confidence signal inputs for computing tool confidence score */
export interface ConfidenceSignals {
  readonly hasAria: boolean;
  readonly hasLabel: boolean;
  readonly hasName: boolean;
  readonly isVisible: boolean;
  readonly hasRole: boolean;
  readonly hasSemanticTag: boolean;
}
