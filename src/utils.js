/**
 * Pure utility functions - no dependencies on other app modules.
 */

export function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

export function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

export function sanitizeImageUrl(url) {
    if (!url) return '';
    // Only allow data URIs and HTTPS URLs
    if (url.startsWith('data:image/')) {
        return url;
    }
    if (url.startsWith('https://')) {
        // Escape any potential attribute-breaking characters
        return url.replace(/"/g, '%22').replace(/'/g, '%27');
    }
    // Block everything else (http, javascript:, etc.)
    console.warn('Blocked unsafe image URL:', url);
    return '';
}

export function getImageExtension(url) {
    if (!url) return 'png';

    // Check for data URL with mime type
    if (url.startsWith('data:image/')) {
        const mimeMatch = url.match(/^data:image\/(\w+)/);
        if (mimeMatch) {
            const mime = mimeMatch[1].toLowerCase();
            // Map common mime types to extensions
            if (mime === 'jpeg') return 'jpg';
            if (mime === 'png') return 'png';
            if (mime === 'gif') return 'gif';
            if (mime === 'webp') return 'webp';
            if (mime === 'svg+xml') return 'svg';
            return mime;
        }
    }

    // Check URL extension
    if (url.startsWith('http')) {
        const urlPath = url.split('?')[0];
        const ext = urlPath.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            return ext === 'jpeg' ? 'jpg' : ext;
        }
    }

    // Default to png
    return 'png';
}

export function approxKB(dataUri) {
    return Math.round(dataUri.length * 0.75 / 1024);
}

export function readFileAsDataURI(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(file);
    });
}

export async function compressDataUri(dataUri, maxDim = 2048, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
                if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else        { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Failed to decode image for compression'));
        img.src = dataUri;
    });
}

export async function compressImageFile(file, maxDim = 2048, quality = 0.85) {
    const dataUri = await readFileAsDataURI(file);
    return compressDataUri(dataUri, maxDim, quality);
}

export function looksLikeRefusal(text) {
    if (!text || typeof text !== 'string') return false;
    const lead = text.trim().slice(0, 200).toLowerCase();
    const openers = [
        "i'm sorry", "i am sorry", "i cannot", "i can't",
        "i'm unable", "i am unable", "unfortunately,", "as an ai"
    ];
    if (openers.some(o => lead.startsWith(o))) return true;
    const phrases = [
        'content policy', 'safety guidelines', 'safety policy',
        'cannot describe', 'cannot provide', 'inappropriate',
        'violates', 'unable to comply'
    ];
    return phrases.some(p => lead.includes(p));
}

export function modeTagHtml(image) {
    const isOrch = image?.mode === 'orchestrator';
    return `<span class="meta-tag mode-tag ${isOrch ? 'mode-orchestrator' : 'mode-manual'}">${isOrch ? '🧩 Orchestrator' : '🖊️ Manual'}</span>`;
}

export function formatPrice(perToken) {
    // OpenRouter prices are in $ per token. Convert to per-1M for display.
    if (!perToken || perToken <= 0) return null;
    const perMillion = perToken * 1_000_000;
    if (perMillion >= 1) return `$${perMillion.toFixed(2)}`;
    return `$${perMillion.toFixed(3)}`;
}

export function speedGlyph(speed) {
    if (speed === 'fast') return '⚡ fast';
    if (speed === 'slow') return '🐢 slow';
    return '◐ medium';
}

export function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
