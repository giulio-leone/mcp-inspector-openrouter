/**
 * Constants extracted from the JS source files.
 * Single source of truth for magic numbers, strings, and configuration.
 */

import type {
  SecurityTier,
  SecurityTierMap,
  ToolCategory,
  AIClassifierConfig,
} from '../types';

// ── Inference Engine ──

/** Maximum number of tools a single category scanner can emit */
export const MAX_TOOLS_PER_CATEGORY = 15;

/** Inference cache TTL in milliseconds (30 seconds) */
export const INFERENCE_CACHE_TTL = 30_000;

/** Confidence threshold: below this tools are sent to AI classifier */
export const AI_CONFIDENCE_THRESHOLD = 0.7;

/** Minimum confidence: below this tools are discarded entirely */
export const MIN_CONFIDENCE = 0.5;

// ── Security Tiers ──

/** Security tier metadata definitions */
export const SECURITY_TIERS: SecurityTierMap = {
  0: { label: 'Safe', autoExecute: true },
  1: { label: 'Navigation', autoExecute: true },
  2: { label: 'Mutation', autoExecute: false },
} as const;

/** Security tier enum values for convenience */
export const SecurityTierLevel = {
  SAFE: 0 as SecurityTier,
  NAVIGATION: 1 as SecurityTier,
  MUTATION: 2 as SecurityTier,
} as const;

// ── Scanner Categories ──

/** All 12 scanner categories in priority order (specialized before generic) */
export const SCANNER_CATEGORIES: readonly ToolCategory[] = [
  'form',
  'navigation',
  'search',
  'richtext',
  'social-action',
  'file-upload',
  'interactive',
  'media',
  'ecommerce',
  'auth',
  'page-state',
  'schema-org',
] as const;

// ── AI Classifier ──

/** Default AI classifier configuration */
export const AI_CLASSIFIER_CONFIG: Readonly<AIClassifierConfig> = {
  confidenceThreshold: 0.65,
  batchSize: 15,
  model: 'google/gemini-2.0-flash-lite-001',
  cacheTTL: 5 * 60 * 1000, // 5 minutes
} as const;

// ── OpenRouter API ──

/** OpenRouter API base URL */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** OpenRouter chat completions endpoint */
export const OPENROUTER_CHAT_ENDPOINT = `${OPENROUTER_BASE_URL}/chat/completions`;

/** OpenRouter models list endpoint */
export const OPENROUTER_MODELS_ENDPOINT = `${OPENROUTER_BASE_URL}/models`;

/** Default model for chat interactions */
export const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

/** Default model for AI classifier (lightweight) */
export const DEFAULT_CLASSIFIER_MODEL = 'google/gemini-2.0-flash-lite-001';

// ── Storage Keys ──

/** localStorage key for conversation data */
export const STORAGE_KEY_CONVERSATIONS = 'wmcp_conversations';

/** localStorage key for lock mode state */
export const STORAGE_KEY_LOCK_MODE = 'wmcp_lock_mode';

/** localStorage key for OpenRouter API key */
export const STORAGE_KEY_API_KEY = 'openrouter_api_key';

/** localStorage key for selected model */
export const STORAGE_KEY_MODEL = 'openrouter_model';

// ── Timing ──

/** Debounce delay for DOM mutation observer (ms) */
export const DOM_OBSERVER_DEBOUNCE_MS = 300;

/** Debounce delay for SPA navigation detection (ms) */
export const SPA_NAVIGATION_DEBOUNCE_MS = 500;

/** Max retry attempts for empty AI responses */
export const AI_MAX_RETRIES = 3;

/** Delay between AI retry attempts (ms) */
export const AI_RETRY_DELAY_MS = 1000;

// ── HTTP Headers ──

/** HTTP-Referer header for OpenRouter requests */
export const OPENROUTER_REFERER = 'https://github.com/miguelspizza/webmcp';

/** X-Title header for OpenRouter requests */
export const OPENROUTER_TITLE = 'Model Context Tool Inspector (OpenRouter)';

/** X-Title header for AI classifier requests */
export const AI_CLASSIFIER_TITLE = 'WMCP AI Classifier';

// ── Content Script ──

/** Content scripts injected on install (bundled into single file by webpack) */
export const CONTENT_SCRIPTS: readonly string[] = [
  'content.js',
] as const;

/** Max products to extract from page context */
export const MAX_PAGE_CONTEXT_PRODUCTS = 20;

/** Shadow DOM max traversal depth */
export const SHADOW_DOM_MAX_DEPTH = 5;
