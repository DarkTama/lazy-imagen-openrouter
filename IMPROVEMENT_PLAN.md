# Lazy Imagen OpenRouter — Improvement Plan

> **Created:** 2026-05-19  
> **Status:** Complete  
> **Last Updated:** 2026-05-20

---

## Legend

| Status | Meaning |
|--------|---------|
| ⬜ Not Started | Work has not begun |
| 🟡 In Progress | Currently being worked on |
| ✅ Done | Completed and verified |
| ⏸️ Blocked | Waiting on something else |

---

## 1. Architecture & Code Organization

### 1.1 Split `app.js` into ES Modules
**Status:** ✅ Done  
**Priority:** High  
**Effort:** High  

**Description:**  
The monolithic `app.js` (~2,900+ lines) handles DB, state management, UI rendering, API calls, and orchestrator logic in a single file. Split into focused modules for maintainability.

**Steps:**
- [x] Create module structure: `db.js`, `state.js`, `api.js`, `orchestrator.js`, `ui.js`, `gallery.js`, `utils.js`
- [x] Extract IndexedDB wrapper (`ImagenDB`) into `db.js`
- [x] Extract state management and defaults into `state.js`
- [x] Extract API communication (fetch calls, error handling) into `api.js`
- [x] Extract orchestrator logic into `orchestrator.js`
- [x] Extract UI helpers (toasts, modals, DOM manipulation) into `ui.js`
- [x] Extract gallery rendering into `gallery.js`
- [x] Extract shared utilities (`escapeHtml`, `debounce`, etc.) into `utils.js`
- [x] Update `index.html` to use `<script type="module">`
- [x] Verify all functionality works after split

---

### 1.2 Add Build Tooling (Optional)
**Status:** ✅ Done  
**Priority:** Low  
**Effort:** Medium  

**Description:**  
Introduce a minimal bundler (Vite or esbuild) to enable import/export, env variables, and dev server with HMR.

**Steps:**
- [x] Initialize `package.json`
- [x] Add Vite as dev dependency
- [x] Configure entry point and output
- [x] Add `dev` and `build` scripts
- [x] Update `.gitignore` for `node_modules/` and `dist/`
- [x] Update README with build instructions

---

## 2. Security & Robustness

### 2.1 Audit and Fix `innerHTML` Usage (XSS Prevention)
**Status:** ✅ Done  
**Priority:** High  
**Effort:** Low  

**Description:**  
Several places use `innerHTML` with dynamically generated content. While `escapeHtml()` is used inconsistently, a systematic audit should replace risky patterns with safe DOM APIs.

**Steps:**
- [ ] Identify all `innerHTML` assignments in `app.js`
- [ ] Categorize: safe (static HTML only) vs. risky (dynamic data injection)
- [ ] Replace risky usages with `textContent`, `createElement`, or template-based builder
- [ ] Verify `escapeHtml()` is applied to ALL user-controlled strings that remain in innerHTML
- [ ] Test that UI renders correctly after changes

---

### 2.2 Improve API Key Handling
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Low  

**Description:**  
API key is stored in `localStorage` as plaintext. Add user-facing transparency and an option for session-only storage.

**Steps:**
- [ ] Add a visible note in the UI that the key is stored locally
- [ ] Add a toggle: "Remember key" (localStorage) vs. "Session only" (sessionStorage)
- [ ] Implement storage switching logic
- [ ] Add a "Clear key" button with confirmation

---

### 2.3 Prompt Length Validation
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Low  

**Description:**  
Add a soft warning when the assembled/manual prompt exceeds model-specific token limits to prevent wasted API calls.

**Steps:**
- [ ] Research token/character limits for each supported model
- [ ] Add a character/token counter near the prompt textarea
- [ ] Show a warning badge when prompt approaches or exceeds the limit
- [ ] Optionally suggest auto-compress for orchestrator prompts

---

## 3. UX & Accessibility

### 3.1 Responsive / Mobile Layout
**Status:** ✅ Done  
**Priority:** High  
**Effort:** Medium  

**Description:**  
The fixed 320px sidebar and rigid layout don't work on tablets or phones. Add responsive breakpoints.

**Steps:**
- [ ] Add CSS media queries for tablet (≤1024px) and mobile (≤768px)
- [ ] Convert sidebar to a slide-out drawer on smaller screens
- [ ] Add a hamburger/menu toggle button
- [ ] Adjust gallery grid to single/double column on mobile
- [ ] Test touch interactions (image upload, sliders, dropdowns)
- [ ] Verify orchestrator workspace is usable on mobile

---

### 3.2 Accessibility (ARIA & Keyboard Navigation)
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Medium  

**Description:**  
Custom dropdowns and interactive elements lack proper ARIA roles and keyboard support.

**Steps:**
- [x] Add `role="listbox"`, `role="option"`, `aria-expanded` to custom selects
- [x] Implement arrow-key navigation for custom dropdowns
- [x] Add `aria-label` to icon-only buttons
- [x] Ensure focus management for modals/panels (trap focus, restore on close)
- [x] Add skip-to-content link
- [x] Test with screen reader (basic verification)

---

### 3.3 Upload Progress Feedback
**Status:** ✅ Done  
**Priority:** Low  
**Effort:** Low  

**Description:**  
When auto-compress processes a large image, there's no visual feedback.

**Steps:**
- [x] Add a small spinner/progress indicator on the upload zone during compression
- [x] Show "Compressing…" text or overlay
- [x] Clear indicator when compression completes

---

### 3.4 Notification History
**Status:** ✅ Done  
**Priority:** Low  
**Effort:** Low  

**Description:**  
Toast messages disappear after a few seconds with no way to review them.

**Steps:**
- [x] Add a notification log (collapsible panel or icon with badge)
- [x] Store last N toast messages with timestamps
- [x] Allow user to review and dismiss notifications
- [x] Badge the notification icon for unread items

---

## 4. Performance

### 4.1 Move Orchestrator Images to IndexedDB
**Status:** ✅ Done  
**Priority:** High  
**Effort:** Low–Medium  

**Description:**  
Orchestrator state (including base64 source/reference images) is stored in `localStorage`, which has a ~5MB limit. Move image data to IndexedDB.

**Steps:**
- [ ] Create a new IndexedDB object store (or reuse existing) for orchestrator images
- [ ] On save: store images in IndexedDB, keep only references (keys) in localStorage
- [ ] On load: retrieve images from IndexedDB by key
- [ ] Handle migration for existing localStorage data
- [ ] Remove base64 blobs from `saveOrchestratorState()` localStorage payload
- [ ] Test with large images (>2MB) to confirm no quota errors

---

### 4.2 Gallery Pagination / Lazy Loading
**Status:** ✅ Done  
**Priority:** High  
**Effort:** Low–Medium  

**Description:**  
All gallery images render into the DOM at once. Add pagination or infinite scroll.

**Steps:**
- [ ] Set initial render limit (e.g., 20 images)
- [ ] Add "Load more" button or infinite scroll trigger
- [ ] Implement incremental DOM insertion
- [ ] Add a total count indicator (e.g., "Showing 20 of 150")
- [ ] Optionally add `loading="lazy"` to `<img>` tags

---

### 4.3 Concurrency Limit for Batch Generation
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Low  

**Description:**  
Requesting multiple images fires all API calls simultaneously, risking rate limits. Add a concurrency pool.

**Steps:**
- [ ] Implement a simple concurrency limiter (max 3 in-flight requests)
- [ ] Wrap `generateAndDisplay()` calls through the limiter
- [ ] Show progress indicator: "Generating 2/8…"
- [ ] Handle 429 errors with automatic retry + backoff within the limiter

---

## 5. Quality & Developer Experience

### 5.1 Add Linting & Formatting
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Low  

**Description:**  
No consistent code style enforcement. Add ESLint + Prettier.

**Steps:**
- [x] Add `.eslintrc.json` with recommended rules
- [x] Add `.prettierrc` with project style preferences
- [x] Add npm scripts: `lint`, `lint:fix`, `format`
- [ ] Fix existing lint errors/warnings
- [ ] Optionally add a pre-commit hook (husky + lint-staged)

---

### 5.2 Add Basic Tests
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Medium  

**Description:**  
No tests exist. Add unit tests for pure logic functions.

**Steps:**
- [x] Choose test framework (Vitest recommended for speed)
- [x] Set up test configuration
- [x] Write tests for `assemblePrompt()`
- [x] Write tests for `classifyError()`
- [x] Write tests for `escapeHtml()` and utility functions
- [x] Write tests for `compressDataUri()` (mock canvas)
- [x] Add npm `test` script
- [x] Document how to run tests in README

---

### 5.3 Configuration & Contributor Docs
**Status:** ✅ Done  
**Priority:** Low  
**Effort:** Low  

**Description:**  
No `.env.example`, contributing guide, or development setup instructions.

**Steps:**
- [x] Add `CONTRIBUTING.md` with setup and workflow instructions
- [x] Document browser requirements (clipboard API, IndexedDB, etc.)
- [x] Add architecture overview to README or separate doc

---

## 6. Feature Enhancements

### 6.1 Image Export/Import (Backup & Restore)
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Medium  

**Description:**  
Users can't back up or transfer their gallery. Add export/import functionality.

**Steps:**
- [x] Add "Export Gallery" button → downloads ZIP of images + metadata JSON
- [x] Add "Import Gallery" option → accepts ZIP, merges into IndexedDB
- [x] Handle duplicate detection (by ID or hash)
- [x] Show progress during export/import
- [x] Add export for individual images (already partially exists via download)

---

### 6.2 Prompt History & Favorites
**Status:** ✅ Done  
**Priority:** Medium  
**Effort:** Low–Medium  

**Description:**  
No way to save and reuse good prompts.

**Steps:**
- [x] Store last N prompts in IndexedDB with timestamps
- [x] Add a "History" dropdown/panel near the prompt textarea
- [x] Allow marking prompts as favorites (starred)
- [x] Add click-to-reuse and click-to-edit actions
- [x] Include both manual and assembled prompts

---

### 6.3 Dark / Light Theme Toggle
**Status:** ✅ Done  
**Priority:** Low  
**Effort:** Low  

**Description:**  
App is dark-mode only. Add a theme toggle leveraging existing CSS variables.

**Steps:**
- [x] Define light-mode CSS variable overrides (`:root[data-theme="light"]`)
- [x] Add theme toggle button in sidebar header
- [x] Persist theme preference in localStorage
- [x] Respect `prefers-color-scheme` as default
- [x] Test all components in both themes

---

### 6.4 Auto-Retry with Backoff
**Status:** ✅ Done  
**Priority:** Low  
**Effort:** Low  

**Description:**  
When generation fails with transient errors (429, 5xx), users must manually retry.

**Steps:**
- [x] Implement exponential backoff utility (base 2s, max 3 retries)
- [x] Apply to `generateSingleImage()` for retryable status codes (429, 500-503)
- [x] Show "Retrying in Xs…" in the loading placeholder
- [x] Skip retry for non-transient errors (400, 401, 402, 404)
- [x] Make retry configurable (on/off toggle in settings)

---

## Summary & Prioritization

| # | Improvement | Priority | Effort | Status |
|---|---|---|---|---|
| 2.1 | Fix innerHTML / XSS | High | Low | ✅ |
| 2.3 | Prompt length validation | Medium | Low | ✅ |
| 4.1 | Orchestrator images → IndexedDB | High | Low–Med | ✅ |
| 4.3 | Concurrency limit | Medium | Low | ✅ |
| 4.2 | Gallery pagination | High | Low–Med | ✅ |
| 3.1 | Responsive layout | High | Medium | ✅ |
| 1.1 | Split into modules | High | High | ✅ |
| 3.2 | Accessibility | Medium | Medium | ✅ |
| 5.1 | Linting & formatting | Medium | Low | ✅ |
| 2.2 | API key handling | Medium | Low | ✅ |
| 6.2 | Prompt history | Medium | Low–Med | ✅ |
| 6.1 | Export/Import gallery | Medium | Medium | ✅ |
| 5.2 | Tests | Medium | Medium | ✅ |
| 6.3 | Theme toggle | Low | Low | ✅ |
| 6.4 | Auto-retry | Low | Low | ✅ |
| 3.3 | Upload progress | Low | Low | ✅ |
| 3.4 | Notification history | Low | Low | ✅ |
| 1.2 | Build tooling | Low | Medium | ✅ |
| 5.3 | Contributor docs | Low | Low | ✅ |

---

## Recommended Execution Order

**Phase 1 — Quick Wins (Low effort, high impact):**
1. Fix innerHTML / XSS audit (2.1)
2. Prompt length validation (2.3)
3. Concurrency limit for batch generation (4.3)
4. Move orchestrator images to IndexedDB (4.1)

**Phase 2 — UX & Performance:**
5. Gallery pagination (4.2)
6. Responsive / mobile layout (3.1)
7. API key handling improvements (2.2)

**Phase 3 — Architecture:**
8. Split app.js into modules (1.1)
9. Add linting & formatting (5.1)

**Phase 4 — Features & Polish:**
10. Prompt history & favorites (6.2)
11. Accessibility improvements (3.2)
12. Export/Import gallery (6.1)
13. Theme toggle (6.3)
14. Auto-retry (6.4)
15. Tests (5.2)
16. Build tooling (1.2)
17. Upload progress feedback (3.3)
18. Notification history (3.4)
19. Contributor docs (5.3)
