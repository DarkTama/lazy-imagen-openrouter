import { describe, it, expect, beforeEach } from 'vitest';
import {
  addNotification,
  getNotifications,
  markAllRead,
  clearNotifications,
  getUnreadCount,
  hydrateNotifications,
} from '../src/notifications.js';

const STORAGE_KEY = 'imagen_notifications';

beforeEach(() => {
  clearNotifications();
  localStorage.clear();
});

describe('addNotification', () => {
  it('adds entries with message, type, and unread state', () => {
    addNotification('Image generated', 'success');
    const items = getNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].message).toBe('Image generated');
    expect(items[0].type).toBe('success');
    expect(items[0].read).toBe(false);
  });

  it('truncates long messages to 200 chars plus ellipsis', () => {
    addNotification('x'.repeat(500), 'info');
    expect(getNotifications()[0].message).toHaveLength(203);
    expect(getNotifications()[0].message.endsWith('...')).toBe(true);
  });

  it('caps the list at 50 entries, keeping the newest', () => {
    for (let i = 0; i < 60; i++) {
      addNotification(`msg ${i}`, 'info');
    }
    const items = getNotifications();
    expect(items).toHaveLength(50);
    expect(items[0].message).toBe('msg 59');
  });
});

describe('persistence', () => {
  it('writes notifications to localStorage on add', () => {
    addNotification('persisted', 'warning');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe('persisted');
  });

  it('hydrates notifications from localStorage', () => {
    addNotification('from previous session', 'error');
    // Simulate a fresh page load: clear in-memory state but keep storage
    const stored = localStorage.getItem(STORAGE_KEY);
    clearNotifications();
    localStorage.setItem(STORAGE_KEY, stored);

    hydrateNotifications();
    const items = getNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].message).toBe('from previous session');
    expect(getUnreadCount()).toBe(1);
  });

  it('persists read state across hydration', () => {
    addNotification('seen already', 'info');
    markAllRead();
    const stored = localStorage.getItem(STORAGE_KEY);
    clearNotifications();
    localStorage.setItem(STORAGE_KEY, stored);

    hydrateNotifications();
    expect(getNotifications()).toHaveLength(1);
    expect(getUnreadCount()).toBe(0);
  });

  it('ignores corrupt storage payloads', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{{');
    hydrateNotifications();
    expect(getNotifications()).toHaveLength(0);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    hydrateNotifications();
    expect(getNotifications()).toHaveLength(0);
  });

  it('drops malformed entries and caps hydrated list at 50', () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      message: `old ${i}`,
      type: 'info',
      read: true,
    }));
    entries.push({ noMessage: true }, null, 42);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));

    hydrateNotifications();
    const items = getNotifications();
    expect(items).toHaveLength(50);
    expect(items.every(n => typeof n.message === 'string')).toBe(true);
  });

  it('clears storage when notifications are cleared', () => {
    addNotification('temp', 'info');
    clearNotifications();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual([]);
  });
});

describe('unread tracking', () => {
  it('counts unread and resets on markAllRead', () => {
    addNotification('a', 'info');
    addNotification('b', 'info');
    expect(getUnreadCount()).toBe(2);
    markAllRead();
    expect(getUnreadCount()).toBe(0);
  });
});
