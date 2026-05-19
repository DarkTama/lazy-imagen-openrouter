/**
 * Theme management - dark/light toggle with localStorage persistence.
 */

const STORAGE_KEY = 'imagen_theme';

export function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    let theme;

    if (saved === 'light' || saved === 'dark') {
        theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        theme = 'light';
    } else {
        theme = 'dark';
    }

    applyTheme(theme);
    updateToggleIcon(theme);
}

export function toggleTheme() {
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    updateToggleIcon(next);
    localStorage.setItem(STORAGE_KEY, next);
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function updateToggleIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const sunIcon = btn.querySelector('.theme-icon-sun');
    const moonIcon = btn.querySelector('.theme-icon-moon');
    if (sunIcon && moonIcon) {
        if (theme === 'light') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }
}
