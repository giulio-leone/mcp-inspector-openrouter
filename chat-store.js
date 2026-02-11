/**
 * chat-store.js — Conversation persistence layer
 * Stores conversations in localStorage, organized by site hostname.
 */

const STORAGE_KEY = 'wmcp_conversations';

function loadAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { return {}; }
}

function saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Get site key from URL (hostname only — all pages on same site share conversations) */
export function siteKey(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url || 'unknown';
    }
}

/** List all conversations for a site */
export function listConversations(site) {
    const all = loadAll();
    return (all[site] || []).map(c => ({ id: c.id, title: c.title, ts: c.ts }));
}

/** Get a specific conversation by id */
export function getConversation(site, id) {
    const all = loadAll();
    return (all[site] || []).find(c => c.id === id) || null;
}

/** Create a new conversation, returns the conversation object */
export function createConversation(site, title = 'New chat') {
    const all = loadAll();
    if (!all[site]) all[site] = [];
    const conv = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        ts: Date.now(),
        messages: [],
    };
    all[site].unshift(conv); // newest first
    saveAll(all);
    return conv;
}

/** Add a message to a conversation */
export function addMessage(site, convId, msg) {
    const all = loadAll();
    const convs = all[site] || [];
    const conv = convs.find(c => c.id === convId);
    if (!conv) return;
    conv.messages.push({ ...msg, ts: Date.now() });
    // Auto-title from first user message
    if (conv.title === 'New chat' && msg.role === 'user') {
        conv.title = msg.content.slice(0, 50) + (msg.content.length > 50 ? '…' : '');
    }
    conv.ts = Date.now();
    saveAll(all);
}

/** Delete a conversation */
export function deleteConversation(site, convId) {
    const all = loadAll();
    if (!all[site]) return;
    all[site] = all[site].filter(c => c.id !== convId);
    if (all[site].length === 0) delete all[site];
    saveAll(all);
}

/** Get all messages for a conversation */
export function getMessages(site, convId) {
    const conv = getConversation(site, convId);
    return conv ? conv.messages : [];
}
