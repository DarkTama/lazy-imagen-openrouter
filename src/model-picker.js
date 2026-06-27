/**
 * Shared searchable model picker.
 * Enhances a .custom-select-options div with:
 *   - ilike search (over id + name)
 *   - sort chips (name | price | subscription-first)
 *   - filter chips (subscription-only, img2img — image kind only)
 *   - refresh button
 *   - subscription badge / price display per row
 *   - optional bestFor subtitle line
 *
 * Pure helpers (filterModels, sortModels) are exported for unit tests.
 */

import { formatUsd } from './utils.js';

// ===== Pure helpers =====

export function filterModels(models, { query = '', filterSubs = false, filterImg2img = false } = {}) {
    let list = models;
    if (query) {
        const q = query.toLowerCase();
        list = list.filter(m => (m.id + ' ' + (m.name || '')).toLowerCase().includes(q));
    }
    if (filterSubs)    list = list.filter(m => m.subscription);
    if (filterImg2img) list = list.filter(m => m.supportsImageInput);
    return list;
}

export function sortModels(models, sort = 'name') {
    const copy = [...models];
    if (sort === 'price') {
        return copy.sort((a, b) => {
            const pa = a.subscription ? 0 : (a.price?.perImage ?? a.price?.prompt ?? Infinity);
            const pb = b.subscription ? 0 : (b.price?.perImage ?? b.price?.prompt ?? Infinity);
            return pa - pb;
        });
    }
    if (sort === 'subscription') {
        return copy.sort((a, b) => {
            if (a.subscription === b.subscription) return 0;
            return a.subscription ? -1 : 1;
        });
    }
    return copy.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

function formatModelPrice(m) {
    if (m.subscription || !m.price) return null;
    if (m.price.perImage)  return `$${formatUsd(m.price.perImage)}/img`;
    if (m.price.prompt)    return `$${formatUsd(m.price.prompt * 1_000_000)}/M`;
    return null;
}

// ===== Factory =====

/**
 * createModelPicker(opts)
 *
 * opts:
 *   container         — .custom-select-options HTMLElement to fill
 *   trigger           — .custom-select-trigger (for aria-expanded + auto-focus)
 *   valueDisplay      — span inside the trigger showing the selected model name
 *   getModels         — () => model[]  (called once at creation; use .refresh() to update)
 *   getSelected       — () => string   (active model id; re-read on each render)
 *   onSelect          — (id) => void
 *   kind              — 'image' | 'vision' | 'research'
 *   onRefresh         — optional async () => model[]  (bypass-cache fetch)
 *   searchPlaceholder — optional string
 *
 * Returns { refresh(models), syncSelected() }
 *   refresh()      — swap the model list and re-render (preserves search/sort/filter state)
 *   syncSelected() — re-render in-place (e.g. after external state change)
 */
export function createModelPicker({
    container,
    trigger,
    valueDisplay,
    getModels,
    getSelected,
    onSelect,
    kind = 'image',
    onRefresh = null,
    searchPlaceholder = 'Search models…'
}) {
    let _models = getModels();
    let _query = '';
    let _sort = 'name';
    let _filterSubs = false;
    let _filterImg2img = false;
    let _refreshing = false;

    const showImg2imgFilter = kind === 'image';

    // ── Build header + list skeleton ──────────────────────────────────
    container.classList.add('mp-enhanced');
    container.innerHTML = `
        <div class="mp-header" role="presentation">
            <div class="mp-search-wrap">
                <input class="mp-search" type="search"
                    placeholder="${searchPlaceholder}"
                    autocomplete="off" spellcheck="false"
                    aria-label="Search models">
                ${onRefresh ? '<button class="mp-refresh-btn" title="Refresh model list" type="button" aria-label="Refresh model list">↻</button>' : ''}
            </div>
            <div class="mp-chips" role="presentation">
                <button class="mp-chip mp-sort active" data-sort="name"         type="button">Name</button>
                <button class="mp-chip mp-sort"        data-sort="price"        type="button">Price ↑</button>
                <button class="mp-chip mp-sort"        data-sort="subscription" type="button">⭐ Subs first</button>
                ${showImg2imgFilter ? `
                <button class="mp-chip mp-filter" data-filter="subscription" type="button">Subscription</button>
                <button class="mp-chip mp-filter" data-filter="img2img"      type="button">img2img</button>` : ''}
            </div>
        </div>
        <div class="mp-list" role="listbox" aria-label="Model options"></div>
    `;

    const searchInput = container.querySelector('.mp-search');
    const listEl      = container.querySelector('.mp-list');
    const refreshBtn  = container.querySelector('.mp-refresh-btn');

    // ── Render option rows ────────────────────────────────────────────
    function renderList() {
        const visible  = sortModels(filterModels(_models, { query: _query, filterSubs: _filterSubs, filterImg2img: _filterImg2img }), _sort);
        const selected = getSelected();
        listEl.innerHTML = '';

        if (visible.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'mp-empty';
            empty.textContent = 'No models match your search.';
            listEl.appendChild(empty);
            return;
        }

        visible.forEach(m => {
            const opt = document.createElement('div');
            opt.className = 'custom-select-option' + (m.id === selected ? ' selected' : '');
            opt.dataset.value = m.id;
            opt.setAttribute('role', 'option');
            opt.setAttribute('aria-selected', m.id === selected ? 'true' : 'false');

            // Top row: name + meta (badge/price/img2img chip)
            const topRow = document.createElement('div');
            topRow.className = 'mp-option-top';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'option-name';
            nameSpan.textContent = m.name || m.id;
            topRow.appendChild(nameSpan);

            const meta = document.createElement('span');
            meta.className = 'option-meta';

            if (m.subscription) {
                const badge = document.createElement('span');
                badge.className = 'mp-badge mp-badge-subscription';
                badge.textContent = 'subscription';
                meta.appendChild(badge);
            } else {
                const priceStr = formatModelPrice(m);
                if (priceStr) {
                    const priceEl = document.createElement('span');
                    priceEl.className = 'mp-price';
                    priceEl.textContent = priceStr;
                    meta.appendChild(priceEl);
                }
            }

            if (showImg2imgFilter && m.supportsImageInput) {
                const chip = document.createElement('span');
                chip.className = 'mp-badge mp-badge-img2img';
                chip.textContent = 'img2img';
                meta.appendChild(chip);
            }

            if (meta.children.length) topRow.appendChild(meta);
            opt.appendChild(topRow);

            // Optional subtitle: bestFor
            if (m.bestFor) {
                const sub = document.createElement('span');
                sub.className = 'option-bestfor';
                sub.textContent = m.bestFor;
                opt.appendChild(sub);
            }

            listEl.appendChild(opt);
        });
    }

    // ── Option selection ──────────────────────────────────────────────
    listEl.addEventListener('click', e => {
        const opt = e.target.closest('.custom-select-option');
        if (!opt) return;
        const id = opt.dataset.value;
        onSelect(id);
        listEl.querySelectorAll('.custom-select-option').forEach(o => {
            const sel = o.dataset.value === id;
            o.classList.toggle('selected', sel);
            o.setAttribute('aria-selected', sel ? 'true' : 'false');
        });
        const displayName = opt.querySelector('.option-name')?.textContent || id;
        if (valueDisplay) valueDisplay.textContent = displayName;
        const customSelect = container.closest('.custom-select');
        if (customSelect) {
            customSelect.classList.remove('open');
            trigger?.setAttribute('aria-expanded', 'false');
        }
    });

    // ── Search input ──────────────────────────────────────────────────
    searchInput.addEventListener('input', () => {
        _query = searchInput.value.trim().toLowerCase();
        renderList();
    });

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const customSelect = container.closest('.custom-select');
            if (customSelect) {
                customSelect.classList.remove('open');
                trigger?.setAttribute('aria-expanded', 'false');
                trigger?.focus();
            }
        }
    });

    // ── Sort / filter chips ───────────────────────────────────────────
    container.addEventListener('click', e => {
        const sortChip = e.target.closest('.mp-sort');
        if (sortChip) {
            _sort = sortChip.dataset.sort;
            container.querySelectorAll('.mp-sort').forEach(c => c.classList.toggle('active', c === sortChip));
            renderList();
            return;
        }
        const filterChip = e.target.closest('.mp-filter');
        if (filterChip) {
            const f = filterChip.dataset.filter;
            if (f === 'subscription') { _filterSubs    = !_filterSubs;    filterChip.classList.toggle('active', _filterSubs); }
            if (f === 'img2img')      { _filterImg2img = !_filterImg2img; filterChip.classList.toggle('active', _filterImg2img); }
            renderList();
        }
    });

    // ── Refresh button ────────────────────────────────────────────────
    if (refreshBtn && onRefresh) {
        refreshBtn.addEventListener('click', async () => {
            if (_refreshing) return;
            _refreshing = true;
            refreshBtn.textContent = '…';
            refreshBtn.disabled = true;
            try {
                const fresh = await onRefresh();
                if (Array.isArray(fresh) && fresh.length) {
                    _models = fresh;
                    renderList();
                }
            } catch (err) {
                console.warn('Model refresh failed:', err);
            } finally {
                _refreshing = false;
                refreshBtn.textContent = '↻';
                refreshBtn.disabled = false;
            }
        });
    }

    // ── Auto-focus search when dropdown opens ─────────────────────────
    if (trigger) {
        trigger.addEventListener('click', () => {
            requestAnimationFrame(() => {
                if (container.closest('.custom-select')?.classList.contains('open')) {
                    searchInput.focus();
                    searchInput.select();
                }
            });
        });
    }

    // ── Initial render ────────────────────────────────────────────────
    renderList();

    // ── Public API ────────────────────────────────────────────────────
    return {
        refresh(models) {
            _models = models;
            renderList();
        },
        syncSelected() {
            renderList();
        },
        setFilter(filterName, active) {
            if (filterName === 'img2img') {
                _filterImg2img = active;
                const chip = container.querySelector('.mp-filter[data-filter="img2img"]');
                if (chip) chip.classList.toggle('active', active);
            }
            if (filterName === 'subscription') {
                _filterSubs = active;
                const chip = container.querySelector('.mp-filter[data-filter="subscription"]');
                if (chip) chip.classList.toggle('active', active);
            }
            renderList();
        }
    };
}
