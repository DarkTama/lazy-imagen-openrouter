/**
 * Help & onboarding: a sectioned guide modal opened from the sidebar help
 * button (or "?"), shown automatically in welcome mode on the first visit.
 *
 * The modal DOM is built here (same precedent as notifications.js). Section
 * content is static trusted markup — no user data is ever interpolated.
 */

import { elements } from './elements.js';
import { activateFocusTrap } from './ui.js';

export const HAS_SEEN_ONBOARDING_KEY = 'imagen_has_seen_onboarding';

export const HELP_SECTIONS = [
    {
        id: 'welcome',
        title: 'Welcome',
        html: `
            <h3>Welcome to Imagen</h3>
            <p>Imagen is a local-first UI for generating images through <strong>OpenRouter</strong>. Everything you make — images, prompts, settings — stays in your browser.</p>
            <p>There are two ways to work:</p>
            <ul>
                <li><strong>Manual mode</strong> — write a prompt, pick a model, click Generate.</li>
                <li><strong>Orchestrator mode</strong> — upload two images and tick checkboxes; a vision model writes the complex image-to-image prompt for you.</li>
            </ul>
            <p>And two free tools that don't touch the API at all: the <strong>Upscaler</strong> and <strong>Background Removal</strong> (see their sections).</p>
        `
    },
    {
        id: 'api-key',
        title: 'API Key',
        html: `
            <h3>Getting an API key</h3>
            <ol>
                <li>Create an account at <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a> and add some credits.</li>
                <li>Open the <strong>Keys</strong> section and create a new key.</li>
                <li>Paste it into the <strong>OpenRouter API Key</strong> field in the sidebar and click <strong>Save Key</strong>.</li>
            </ol>
            <p>The key is stored only in your browser. "Remember key" keeps it across restarts (localStorage); unticked, it lives only for the session. It is sent nowhere except to OpenRouter itself.</p>
        `
    },
    {
        id: 'manual',
        title: 'Manual Mode',
        html: `
            <h3>Manual mode</h3>
            <p>Type a prompt in the big textarea, pick a <strong>Model</strong>, <strong>Quality</strong>, <strong>Aspect Ratio</strong> and image count in the sidebar, then click <strong>Generate</strong> (or press <kbd>Ctrl/Cmd + Enter</kbd>).</p>
            <p>The model card under the dropdown shows live pricing and what each model is best at. The <strong>History</strong> button recalls past prompts, with favorites.</p>
            <p>A cost estimate under the Generate button shows roughly what a batch will cost before you click.</p>
        `
    },
    {
        id: 'references',
        title: 'Reference Images',
        html: `
            <h3>Reference images</h3>
            <p>Models that support image input can use reference images. Add them by:</p>
            <ul>
                <li>clicking <strong>+ Add</strong> in the sidebar,</li>
                <li>dragging a file anywhere onto the page,</li>
                <li>pasting from the clipboard (<kbd>Ctrl/Cmd + V</kbd>),</li>
                <li>or clicking the pin icon on any gallery image.</li>
            </ul>
            <p>Each model caps how many references it accepts (shown in its info card). References are restored when you reload the page.</p>
        `
    },
    {
        id: 'orchestrator',
        title: 'Orchestrator Mode',
        html: `
            <h3>Orchestrator mode</h3>
            <p>For image-to-image work without writing prose. Flip the toggle in the sidebar, then:</p>
            <ol>
                <li>Upload a <strong>Source</strong> image (the character to preserve) and a <strong>Reference</strong> image (the style/pose/outfit donor). You can also drag a gallery card straight onto a slot, pick from the <strong>Recent</strong> strip, or use the ⇄ button to swap the two.</li>
                <li>Tick what to transfer — or apply a <strong>preset</strong> (Outfit swap, Pose copy, Full style transfer, Scene swap), use <strong>All/None</strong>, and save your own combos.</li>
                <li>Optionally tune <strong>Art Style</strong>, <strong>Identity Lock</strong> and <strong>Creativity</strong>.</li>
                <li>Click <strong>Generate</strong>: a vision model reads both images and assembles the final prompt automatically. The readiness chips in the footer show what's still missing.</li>
            </ol>
            <p><strong>Free re-assembly:</strong> the vision analysis of your image pair is cached. Change toggles or style afterwards and re-assembling is instant and costs nothing — only swapping images (or the vision model) triggers a new paid analysis. A badge on the Assembled Prompt tells you when settings changed.</p>
            <p>Liked a result? Open it and click <strong>Iterate: use as Source</strong> to feed it back in for another pass.</p>
            <p>If the model doesn't know your subject (a niche character, a new product), describe it in <strong>Subject Context</strong> — or click 🔍 Research to look it up via Perplexity.</p>
        `
    },
    {
        id: 'gallery',
        title: 'Gallery',
        html: `
            <h3>Gallery</h3>
            <p>Every generated image lands here, stored in your browser (IndexedDB) so it survives restarts. Hover a card for quick actions: download, delete, use as reference, recreate with the same settings, edit in Image Tools, copy, and favorite.</p>
            <p>Click a card for the full view with metadata — use <kbd>←</kbd> <kbd>→</kbd> to flip through images.</p>
            <p>Use the search box to filter by prompt text or model, and the ★ chip to show favorites only. <strong>Export Gallery</strong> saves everything to a JSON file you can <strong>Import</strong> elsewhere. The bell collects past notifications.</p>
        `
    },
    {
        id: 'upscaler',
        title: 'Upscaler',
        html: `
            <h3>Image Tools: Upscaler</h3>
            <p>Enlarge any image 2–4× <strong>without spending any tokens</strong> — it's classic Lanczos resampling running in your browser, not AI.</p>
            <ol>
                <li>Open it from the sliders icon on a gallery card, the <strong>Edit</strong> button in the image view, or the <strong>Image Tools</strong> toolbar button (which also accepts local files, drag-drop and paste). Each tab keeps its own image — <strong>× Change image</strong> swaps in a different one.</li>
                <li>Pick a scale, optionally tick <strong>Sharpen</strong>, click <strong>Upscale</strong>.</li>
                <li><strong>Compare with original</strong> shows a split view — drag the slider (or the image itself) to move the divider.</li>
                <li>Download as PNG/JPEG, or save straight back into the gallery.</li>
            </ol>
            <p>Tip: generate at a cheap resolution, then upscale locally for free.</p>
        `
    },
    {
        id: 'bg-removal',
        title: 'Background Removal',
        html: `
            <h3>Image Tools: Background Removal</h3>
            <p>Cuts the background out of an image — by default <strong>no AI, no tokens</strong>. Auto-detect flood-fills from the image borders and is tuned to stop at anti-aliased edges, so solid, gradient, and pastel backgrounds all work. If a result would wipe nearly the whole image it automatically retries at a lower tolerance, and reverts with an explanation if that fails too.</p>
            <ul>
                <li><strong>Tolerance</strong> controls how aggressively similar colors are treated as background; re-run Auto-detect after changing it.</li>
                <li>The <strong>Remove</strong> brush erases leftovers; the <strong>Keep</strong> brush restores anything taken by mistake. <kbd>[</kbd> and <kbd>]</kbd> resize the brush.</li>
                <li><strong>Smart select (magic wand)</strong>: with it on, a single click selects the <em>whole connected color region</em> and removes it (Remove mode) or restores it (Keep mode) — no brushing required.</li>
                <li><strong>Edge feather</strong> softens the cutout edge; <kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Y</kbd> undo and redo strokes.</li>
                <li><strong>✨ AI assist (optional, uses credits)</strong>: a vision model repaints the background a solid key color which is then removed locally — great for busy backgrounds. You always get a confirmation with the cost (≈ $0.04) before anything is charged, and the AI's version of the image replaces your working copy.</li>
            </ul>
            <p>Export as a transparent PNG, or save it back to the gallery.</p>
        `
    },
    {
        id: 'tips',
        title: 'Tips & Shortcuts',
        html: `
            <h3>Tips &amp; shortcuts</h3>
            <ul>
                <li><strong>Save tokens:</strong> copy the assembled prompt (and your images) into Google Gemini or another free tool and generate there — the tip under the Generate button (and under the Assembled Prompt in Orchestrator mode) has a one-click copy.</li>
                <li><strong>Free re-assembly:</strong> in Orchestrator mode the vision analysis is cached — tweak toggles and re-assemble as often as you like without spending tokens.</li>
                <li>If a model refuses your prompt, try a GPT-5 Image model (different content thresholds) or a more permissive vision analyst (Qwen-VL, Llama Vision) in the Advanced drawer.</li>
                <li>Large galleries live in browser storage — <strong>Export Gallery</strong> periodically as a backup.</li>
                <li>You can install Imagen as an app: look for the install icon in your browser's address bar. The app shell works offline; generation still needs a connection.</li>
            </ul>
            <table class="help-shortcuts">
                <tr><td><kbd>Ctrl/Cmd + Enter</kbd></td><td>Generate</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close any modal</td></tr>
                <tr><td><kbd>?</kbd></td><td>Open this help</td></tr>
                <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>Previous / next image in the viewer</td></tr>
                <tr><td><kbd>Ctrl/Cmd + V</kbd></td><td>Paste image as reference (or into Image Tools)</td></tr>
                <tr><td><kbd>[</kbd> / <kbd>]</kbd></td><td>Brush size in Background Removal</td></tr>
                <tr><td><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd></td><td>Undo / redo brush strokes</td></tr>
            </table>
        `
    }
];

let _modal = null;
let _releaseTrap = null;
let _welcomeMode = false;
let _activeSectionId = HELP_SECTIONS[0].id;

export function hasSeenOnboarding() {
    try {
        return localStorage.getItem(HAS_SEEN_ONBOARDING_KEY) === 'true';
    } catch (e) {
        return true; // storage unavailable — don't nag every load
    }
}

function markOnboardingSeen() {
    try {
        localStorage.setItem(HAS_SEEN_ONBOARDING_KEY, 'true');
    } catch (e) {
        console.warn('Could not persist onboarding flag:', e);
    }
}

export function isHelpOpen() {
    return Boolean(_modal && _modal.classList.contains('active'));
}

export function openHelp(sectionId = HELP_SECTIONS[0].id, { welcome = false } = {}) {
    if (!_modal) return;
    _welcomeMode = welcome;

    _modal.querySelector('#helpModalTitle').textContent = welcome ? 'Welcome to Imagen' : 'Help & Guide';
    _modal.querySelector('.help-modal-subtitle').hidden = !welcome;
    _modal.querySelector('.help-modal-footer').hidden = !welcome;

    renderSection(sectionId);
    _modal.classList.add('active');
    if (_releaseTrap) _releaseTrap();
    _releaseTrap = activateFocusTrap(_modal.querySelector('.modal-content'));
}

export function closeHelp() {
    if (!isHelpOpen()) return;
    if (_welcomeMode) {
        const dontShow = _modal.querySelector('#helpDontShowAgain');
        if (dontShow?.checked) markOnboardingSeen();
        _welcomeMode = false;
    }
    _modal.classList.remove('active');
    if (_releaseTrap) {
        _releaseTrap();
        _releaseTrap = null;
    }
}

let _listenersAttached = false;

export function initHelp() {
    buildModal();

    if (!_listenersAttached) {
        _listenersAttached = true;

        if (elements.helpBtn) {
            elements.helpBtn.addEventListener('click', () => openHelp());
        }

        // "?" opens help unless the user is typing somewhere
        document.addEventListener('keydown', (e) => {
            if (e.key === '?' && !isTypingTarget(e.target)) {
                e.preventDefault();
                if (isHelpOpen()) {
                    closeHelp();
                } else {
                    openHelp();
                }
            }
            if (e.key === 'Escape' && isHelpOpen()) {
                closeHelp();
            }
        });
    }

    // First visit: open the full guide in welcome mode once layout settles
    if (!hasSeenOnboarding()) {
        setTimeout(() => {
            if (!isHelpOpen()) openHelp(HELP_SECTIONS[0].id, { welcome: true });
        }, 400);
    }
}

function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function buildModal() {
    if (document.getElementById('helpModal')) {
        _modal = document.getElementById('helpModal');
        return;
    }

    _modal = document.createElement('div');
    _modal.className = 'modal help-modal';
    _modal.id = 'helpModal';
    _modal.setAttribute('role', 'dialog');
    _modal.setAttribute('aria-modal', 'true');
    _modal.setAttribute('aria-labelledby', 'helpModalTitle');
    _modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content help-modal-content">
            <button class="modal-close" id="helpModalClose" aria-label="Close help">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <header class="help-modal-header">
                <h2 id="helpModalTitle">Help &amp; Guide</h2>
                <p class="help-modal-subtitle" hidden>A quick tour of what this tool can do. You can reopen this guide anytime with the ? button in the sidebar.</p>
            </header>
            <div class="help-modal-body">
                <nav class="help-nav" aria-label="Help sections"></nav>
                <div class="help-content"></div>
            </div>
            <footer class="help-modal-footer" hidden>
                <label class="tools-check">
                    <input type="checkbox" id="helpDontShowAgain" checked>
                    <span>Don't show this again</span>
                </label>
                <button type="button" class="btn btn-primary" id="helpGetStarted">Get started</button>
            </footer>
        </div>
    `;
    document.body.appendChild(_modal);

    const nav = _modal.querySelector('.help-nav');
    HELP_SECTIONS.forEach(section => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'help-nav-btn';
        btn.dataset.sectionId = section.id;
        btn.textContent = section.title;
        btn.addEventListener('click', () => renderSection(section.id));
        nav.appendChild(btn);
    });

    _modal.querySelector('#helpModalClose').addEventListener('click', closeHelp);
    _modal.querySelector('.modal-overlay').addEventListener('click', closeHelp);
    _modal.querySelector('#helpGetStarted').addEventListener('click', closeHelp);
}

function renderSection(sectionId) {
    const section = HELP_SECTIONS.find(s => s.id === sectionId) || HELP_SECTIONS[0];
    _activeSectionId = section.id;

    _modal.querySelectorAll('.help-nav-btn').forEach(btn => {
        const active = btn.dataset.sectionId === section.id;
        btn.classList.toggle('active', active);
        if (active) {
            btn.setAttribute('aria-current', 'true');
        } else {
            btn.removeAttribute('aria-current');
        }
    });

    const content = _modal.querySelector('.help-content');
    content.innerHTML = section.html;
    content.scrollTop = 0;
}

export function getActiveHelpSection() {
    return _activeSectionId;
}
