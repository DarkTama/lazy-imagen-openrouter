/**
 * Prompt History panel - manages UI for saved prompts with favorites.
 */

import ImagenDB from './db.js';
import { elements } from './elements.js';
import { escapeHtml } from './utils.js';

let historyPanelOpen = false;

export function initHistory() {
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (historyPanelOpen) {
                closeHistoryPanel();
            } else {
                openHistoryPanel();
            }
        });
    }

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('historyPanel');
        const btn = document.getElementById('historyBtn');
        if (panel && historyPanelOpen && !panel.contains(e.target) && !btn.contains(e.target)) {
            closeHistoryPanel();
        }
    });
}

export async function openHistoryPanel() {
    let panel = document.getElementById('historyPanel');
    if (!panel) {
        panel = createHistoryPanel();
        const promptContainer = document.querySelector('.prompt-container');
        if (promptContainer) {
            promptContainer.appendChild(panel);
        }
    }
    panel.classList.add('active');
    historyPanelOpen = true;
    await renderHistoryList();
}

export function closeHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    if (panel) {
        panel.classList.remove('active');
    }
    historyPanelOpen = false;
}

function createHistoryPanel() {
    const panel = document.createElement('div');
    panel.id = 'historyPanel';
    panel.className = 'history-panel';
    panel.innerHTML = '<div class="history-panel-header">' +
        '<input type="text" class="history-search" id="historySearch" placeholder="Search prompts...">' +
        '<button type="button" class="btn-ghost-sm history-clear-btn" id="historyClearAll">Clear All</button>' +
        '</div>' +
        '<div class="history-list" id="historyList"></div>';

    panel.querySelector('#historySearch').addEventListener('input', (e) => {
        filterHistoryList(e.target.value);
    });

    panel.querySelector('#historyClearAll').addEventListener('click', async () => {
        await ImagenDB.clearPromptHistory();
        await renderHistoryList();
    });

    return panel;
}

export async function renderHistoryList() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;

    let prompts;
    try {
        prompts = await ImagenDB.getAllPrompts();
    } catch (e) {
        console.error('Failed to load prompt history:', e);
        prompts = [];
    }

    if (prompts.length === 0) {
        listEl.innerHTML = '<div class="history-empty">No prompt history yet</div>';
        return;
    }

    const favorites = prompts.filter(p => p.isFavorite);
    const regular = prompts.filter(p => !p.isFavorite);

    let html = '';

    if (favorites.length > 0) {
        html += '<div class="history-section-label">Favorites</div>';
        favorites.forEach(p => { html += renderHistoryItem(p); });
    }

    if (regular.length > 0) {
        if (favorites.length > 0) {
            html += '<div class="history-section-label">Recent</div>';
        }
        regular.forEach(p => { html += renderHistoryItem(p); });
    }

    listEl.innerHTML = html;
    attachHistoryItemListeners(listEl);
}

function renderHistoryItem(prompt) {
    const truncated = prompt.text.length > 80
        ? escapeHtml(prompt.text.substring(0, 80)) + '...'
        : escapeHtml(prompt.text);
    const date = new Date(prompt.timestamp);
    const timeStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const starClass = prompt.isFavorite ? 'history-star active' : 'history-star';
    const modeTag = prompt.mode === 'orchestrator' ? '<span class="history-mode-tag">orch</span>' : '';

    return '<div class="history-item" data-id="' + prompt.id + '">' +
        '<div class="history-item-content">' +
        '<span class="history-item-text">' + truncated + '</span>' +
        '<span class="history-item-meta">' + timeStr + ' ' + modeTag + '</span>' +
        '</div>' +
        '<div class="history-item-actions">' +
        '<button type="button" class="' + starClass + '" data-id="' + prompt.id + '" title="Toggle favorite">' +
        '<svg viewBox="0 0 24 24" fill="' + (prompt.isFavorite ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>' +
        '</button>' +
        '<button type="button" class="history-delete" data-id="' + prompt.id + '" title="Delete">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
        '</button>' +
        '</div>' +
        '</div>';
}

function attachHistoryItemListeners(listEl) {
    listEl.querySelectorAll('.history-item-content').forEach(el => {
        el.addEventListener('click', () => {
            const item = el.closest('.history-item');
            const id = parseInt(item.dataset.id);
            reusePromptFromHistory(id);
        });
    });

    listEl.querySelectorAll('.history-star').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            await ImagenDB.toggleFavorite(id);
            await renderHistoryList();
        });
    });

    listEl.querySelectorAll('.history-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            await ImagenDB.deletePrompt(id);
            await renderHistoryList();
        });
    });
}

async function reusePromptFromHistory(id) {
    let prompts;
    try {
        prompts = await ImagenDB.getAllPrompts();
    } catch (e) {
        return;
    }
    const prompt = prompts.find(p => p.id === id);
    if (prompt && elements.promptInput) {
        elements.promptInput.value = prompt.text;
        elements.promptInput.focus();
        elements.charCount.textContent = prompt.text.length + ' chars';
        closeHistoryPanel();
    }
}

function filterHistoryList(query) {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;
    const items = listEl.querySelectorAll('.history-item');
    const q = query.toLowerCase();
    items.forEach(item => {
        const text = item.querySelector('.history-item-text')?.textContent?.toLowerCase() || '';
        item.style.display = text.includes(q) ? '' : 'none';
    });
}
