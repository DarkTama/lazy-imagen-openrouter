/**
 * Notification history system.
 * Maintains an in-memory log of toast notifications with unread badge.
 */

import { setNotificationHook } from './utils.js';

const MAX_NOTIFICATIONS = 50;
const MAX_MESSAGE_LENGTH = 200;
let notifications = [];

export function addNotification(message, type) {
    let truncatedMessage = String(message || '');
    if (truncatedMessage.length > MAX_MESSAGE_LENGTH) {
        truncatedMessage = truncatedMessage.substring(0, MAX_MESSAGE_LENGTH) + '...';
    }
    const entry = {
        id: Date.now() + Math.random(),
        message: truncatedMessage,
        type: type || 'info',
        timestamp: new Date().toISOString(),
        read: false
    };
    notifications.unshift(entry);
    if (notifications.length > MAX_NOTIFICATIONS) {
        notifications = notifications.slice(0, MAX_NOTIFICATIONS);
    }
    updateNotificationBadge();
}

export function getNotifications() {
    return [...notifications];
}

export function markAllRead() {
    notifications.forEach(n => { n.read = true; });
    updateNotificationBadge();
}

export function clearNotifications() {
    notifications = [];
    updateNotificationBadge();
    renderNotificationList();
}

export function getUnreadCount() {
    return notifications.filter(n => !n.read).length;
}

export function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    const count = getUnreadCount();
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }
}

export function initNotifications() {
    // Insert bell button into .gallery-header after .gallery-count
    const galleryHeader = document.querySelector('.gallery-header');
    if (!galleryHeader) return;

    const galleryCount = document.getElementById('galleryCount');

    // Create bell button
    const bellBtn = document.createElement('button');
    bellBtn.className = 'notification-bell';
    bellBtn.id = 'notificationBell';
    bellBtn.setAttribute('aria-label', 'Notifications');
    bellBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <span class="notification-badge" id="notificationBadge" hidden>0</span>
    `;

    // Insert after gallery count
    if (galleryCount && galleryCount.nextSibling) {
        galleryHeader.insertBefore(bellBtn, galleryCount.nextSibling);
    } else if (galleryCount) {
        galleryHeader.appendChild(bellBtn);
    } else {
        galleryHeader.appendChild(bellBtn);
    }

    // Create notification panel
    const panel = document.createElement('div');
    panel.className = 'notification-panel';
    panel.id = 'notificationPanel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="notification-panel-header">
            <h4>Notifications</h4>
            <button class="btn-ghost-sm" id="clearNotifications">Clear all</button>
        </div>
        <div class="notification-panel-list" id="notificationList"></div>
    `;
    galleryHeader.appendChild(panel);

    // Bell click handler
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = panel.hidden;
        if (isHidden) {
            panel.hidden = false;
            markAllRead();
            renderNotificationList();
        } else {
            panel.hidden = true;
        }
    });

    // Clear all button
    const clearBtn = panel.querySelector('#clearNotifications');
    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearNotifications();
    });

    // Outside click closes panel
    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
            panel.hidden = true;
        }
    });

    // Escape closes panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !panel.hidden) {
            panel.hidden = true;
        }
    });

    // Hook into the toast system
    setNotificationHook(addNotification);
}

function renderNotificationList() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = '<div class="notification-panel-empty">No notifications yet</div>';
        return;
    }

    list.innerHTML = notifications.map(n => {
        const typeClass = n.type || 'info';
        const timeStr = formatRelativeTime(n.timestamp);
        return `
            <div class="notification-item">
                <span class="notification-item-type ${typeClass}"></span>
                <div class="notification-item-content">
                    <div class="notification-item-message">${escapeNotificationHtml(n.message)}</div>
                    <div class="notification-item-time">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

function escapeNotificationHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 10) return 'just now';
    if (diffSec < 60) return diffSec + 's ago';
    if (diffMin < 60) return diffMin + 'm ago';
    if (diffHour < 24) return diffHour + 'h ago';
    return date.toLocaleDateString();
}
