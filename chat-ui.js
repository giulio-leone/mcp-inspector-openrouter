/**
 * chat-ui.js — Chat bubble rendering and conversation selector UI
 */

const chatContainer = document.getElementById('chatContainer');
const conversationSelect = document.getElementById('conversationSelect');

/** Scroll chat to bottom */
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/** Clear all bubbles from the chat container */
export function clearChat() {
    chatContainer.innerHTML = '';
}

/** Add a bubble to the chat UI and scroll */
export function appendBubble(role, content, meta = {}) {
    const bubble = document.createElement('div');
    bubble.className = `bubble bubble-${role}`;

    const body = document.createElement('div');
    body.className = 'bubble-body';

    switch (role) {
        case 'user':
            body.textContent = content;
            break;
        case 'ai':
            // Simple markdown-like rendering: bold, code, newlines
            body.innerHTML = formatAIText(content);
            break;
        case 'tool_call':
            body.innerHTML = `<span class="tool-icon">⚡</span> <strong>${meta.tool}</strong> <code>${JSON.stringify(meta.args)}</code>`;
            break;
        case 'tool_result':
            body.innerHTML = `<span class="tool-icon">✅</span> <strong>${meta.tool}</strong> → <code>${content}</code>`;
            break;
        case 'tool_error':
            body.innerHTML = `<span class="tool-icon">❌</span> <strong>${meta.tool}</strong> → <code>${content}</code>`;
            break;
        case 'error':
            body.innerHTML = `<span class="tool-icon">⚠️</span> ${content}`;
            break;
    }

    bubble.appendChild(body);

    // Timestamp
    const time = document.createElement('div');
    time.className = 'bubble-time';
    time.textContent = new Date(meta.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(time);

    chatContainer.appendChild(bubble);
    scrollToBottom();
}

/** Render all messages from a conversation */
export function renderConversation(messages) {
    clearChat();
    for (const msg of messages) {
        appendBubble(msg.role, msg.content, msg);
    }
}

/** Populate the conversation selector dropdown */
export function populateSelector(conversations, activeId) {
    conversationSelect.innerHTML = '';
    if (conversations.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No conversations';
        opt.disabled = true;
        opt.selected = true;
        conversationSelect.appendChild(opt);
        return;
    }
    for (const conv of conversations) {
        const opt = document.createElement('option');
        opt.value = conv.id;
        opt.textContent = conv.title;
        if (conv.id === activeId) opt.selected = true;
        conversationSelect.appendChild(opt);
    }
}

/** Simple text formatting for AI responses */
function formatAIText(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold: **text**
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Inline code: `text`
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Newlines
        .replace(/\n/g, '<br>');
}
