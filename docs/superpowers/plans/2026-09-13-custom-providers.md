# OpenAI-Compatible Custom Providers & Cross-Provider Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to configure arbitrary OpenAI-compatible endpoints and freely mix different providers for Image Generation, Vision Analysis, and Web Research.

**Architecture:** Extend provider registry in `src/providers.js` with local persistence and capability flags. Decouple state in `src/state.js` into role-specific providers. Refactor API execution in `src/api.js` to dispatch calls per role provider with standard OpenAI payload formats. Build modal UI for custom provider CRUD and update Orchestrator / Sidebar pickers.

**Tech Stack:** Vanilla JavaScript (ES modules), Vitest, JSDOM, HTML5, CSS3, IndexedDB / localStorage.

**Spec:** `docs/superpowers/specs/2026-09-13-custom-providers-design.md`

## Global Constraints
- No framework dependencies. Vanilla ES modules only.
- Preserve backward compatibility for existing OpenRouter and NanoGPT configurations in `localStorage`.
- All tests in `tests/` must pass after every task.
- Responsive layout: changes must adapt cleanly to both mobile and desktop viewports.
- Security: Sanitize all custom provider inputs and display safe URLs/names. Never leak keys in error toasts or logs.

---

### Task 1: Dynamic Provider Registry & Persistence in `src/providers.js`

**Files:**
- Modify: `src/providers.js`
- Test: `tests/providers.test.js`

**Interfaces:**
- Produces:
  - `getAllProviders(): ProviderConfig[]`
  - `getProvider(id: string): ProviderConfig | null`
  - `getProvidersByCapability(capability: 'imageGen' | 'chatVision'): ProviderConfig[]`
  - `saveCustomProvider(config: ProviderConfig): ProviderConfig`
  - `deleteCustomProvider(id: string): boolean`
  - `loadCustomProviders(): ProviderConfig[]`
  - Constants: `CUSTOM_PROVIDERS_STORAGE_KEY = 'imagen_custom_providers'`

- [ ] **Step 1: Write failing tests for provider CRUD & filtering**

Create `tests/providers.test.js`:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import {
    getAllProviders,
    getProvider,
    getProvidersByCapability,
    saveCustomProvider,
    deleteCustomProvider,
    CUSTOM_PROVIDERS_STORAGE_KEY
} from '../src/providers.js';

describe('providers registry', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns built-in providers by default', () => {
        const all = getAllProviders();
        expect(all.some(p => p.id === 'openrouter')).toBe(true);
        expect(all.some(p => p.id === 'nanogpt')).toBe(true);
    });

    it('saves and retrieves a custom OpenAI provider', () => {
        const custom = saveCustomProvider({
            name: 'Local Ollama',
            base: 'http://localhost:11434/v1',
            capabilities: { imageGen: false, chatVision: true },
            imageStrategy: 'images-endpoint'
        });
        expect(custom.id).toBeDefined();
        expect(custom.isBuiltIn).toBe(false);

        const found = getProvider(custom.id);
        expect(found.name).toBe('Local Ollama');
        expect(found.base).toBe('http://localhost:11434/v1');
    });

    it('filters providers by capability', () => {
        saveCustomProvider({
            name: 'Vision Only',
            base: 'https://vision.ai/v1',
            capabilities: { imageGen: false, chatVision: true }
        });
        saveCustomProvider({
            name: 'Image Only',
            base: 'https://img.ai/v1',
            capabilities: { imageGen: true, chatVision: false }
        });

        const imageProviders = getProvidersByCapability('imageGen');
        expect(imageProviders.some(p => p.name === 'Image Only')).toBe(true);
        expect(imageProviders.some(p => p.name === 'Vision Only')).toBe(false);

        const visionProviders = getProvidersByCapability('chatVision');
        expect(visionProviders.some(p => p.name === 'Vision Only')).toBe(true);
        expect(visionProviders.some(p => p.name === 'Image Only')).toBe(false);
    });

    it('deletes custom provider but prevents deleting built-ins', () => {
        const custom = saveCustomProvider({
            name: 'Temp Provider',
            base: 'https://temp.ai/v1',
            capabilities: { imageGen: true, chatVision: true }
        });
        expect(deleteCustomProvider(custom.id)).toBe(true);
        expect(getProvider(custom.id)).toBeNull();

        expect(deleteCustomProvider('openrouter')).toBe(false);
        expect(getProvider('openrouter')).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/providers.test.js`
Expected: FAIL (functions not defined in `src/providers.js`)

- [ ] **Step 3: Implement dynamic provider registry in `src/providers.js`**

Update `src/providers.js` with:
- Standard capabilities for built-in OpenRouter (`{ imageGen: true, chatVision: true }`) and NanoGPT (`{ imageGen: true, chatVision: true }`).
- Helper functions to load, save, delete custom providers from `localStorage`.
- Base URL normalizer (strips trailing slashes).
- Dynamic provider header generator: supports custom API keys passed or loaded.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/providers.test.js`
Expected: PASS

- [ ] **Step 5: Run all tests to ensure no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/providers.js tests/providers.test.js
git commit -m "feat: dynamic provider registry and local persistence"
```

---

### Task 2: State Decoupling & Storage Migration in `src/state.js`

**Files:**
- Modify: `src/state.js`
- Test: `tests/state.test.js`

**Interfaces:**
- Consumes: `getProvider`, `getAllProviders` from `src/providers.js`
- Produces:
  - `state.generationProvider` (replaces singular `state.provider` usage)
  - `state.orchestrator.visionProvider`
  - `state.orchestrator.researchProvider`
  - Migration logic for legacy `imagen_provider` key
  - Role-based storage getters/setters:
    - `loadSelectedModelForProvider(providerId, role)`
    - `loadApiKeyForProvider(providerId)`

- [ ] **Step 1: Write failing test for state decoupling and migrations**

Create `tests/state.test.js`:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { state, ORCHESTRATOR_DEFAULTS, loadApiKeyForProvider } from '../src/state.js';

describe('state role-based provider decoupling', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('has independent provider fields in state and orchestrator defaults', () => {
        expect(state.generationProvider).toBeDefined();
        expect(ORCHESTRATOR_DEFAULTS.visionProvider).toBe('openrouter');
        expect(ORCHESTRATOR_DEFAULTS.researchProvider).toBe('openrouter');
    });

    it('loads per-provider api key correctly', () => {
        localStorage.setItem('imagen_api_key_custom_1', 'custom-key-123');
        expect(loadApiKeyForProvider('custom_1')).toBe('custom-key-123');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state.test.js`
Expected: FAIL

- [ ] **Step 3: Update `src/state.js`**

- Update `state` object: add `generationProvider`, `orchestrator.visionProvider`, `orchestrator.researchProvider`.
- Preserve getter/setter for legacy `state.provider` mapped to `state.generationProvider` to avoid breaking unmigrated modules during transition.
- Add migration in `migrateStorageKeys()`:
  - `localStorage['imagen_provider']` -> set `imagen_generation_provider`.
- Update `ORCHESTRATOR_DEFAULTS`:
  - `visionProvider: 'openrouter'`
  - `researchProvider: 'openrouter'`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/state.test.js`
Expected: PASS

- [ ] **Step 5: Run all tests to ensure no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "feat: decouple provider state by role and add migrations"
```

---

### Task 3: API Layer Refactoring for Generic OpenAI Providers in `src/api.js`

**Files:**
- Modify: `src/api.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: `getProvider` from `src/providers.js`, `loadApiKeyForProvider` from `src/state.js`
- Produces:
  - `providerFetchArgs(providerId: string)`
  - Updated `generateSingleImage(...)`: routes by target `providerId`
  - Updated `runVisionAnalysis(...)`: accepts `(sourceB64, refB64, modelId, providerId)`
  - Updated `researchSubject(...)`: accepts `(subject, modelId, providerId)`
  - `testProviderConnection(providerId: string): Promise<{ ok: boolean, error?: string }>`
  - `fetchProviderModels(providerId: string, options?: { force?: boolean }): Promise<Array<{ id: string, name: string }>>`

- [ ] **Step 1: Add tests in `tests/api.test.js` for custom provider calls & error attribution**

Update `tests/api.test.js` to test:
- `generateSingleImage` calling custom provider via `/images/generations` with `b64_json` response.
- `generateSingleImage` calling custom provider via `/images/generations` with `url` response.
- `runVisionAnalysis` passing correct authorization and URL for specified `providerId`.
- `ApiError` contains `providerId` and `role`.
- `testProviderConnection` succeeds on 200 and fails on 401/network error.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api.test.js`
Expected: FAIL

- [ ] **Step 3: Implement API multi-provider dispatch and testing in `src/api.js`**

- Refactor `providerFetchArgs(providerId)`: takes explicit `providerId` instead of reading global state.
- Update `generateSingleImage`:
  - Determine `providerId = state.generationProvider`.
  - Dispatch to `/images/generations` for custom providers supporting `imageGen` or NanoGPT.
  - Dispatch to `/chat/completions` (modalities) for OpenRouter Gemini.
  - Parse response: handle either `b64_json` or `url` format.
- Update `runVisionAnalysis(sourceB64, refB64, modelId, providerId)`:
  - Uses `providerId || state.orchestrator.visionProvider`.
  - Attaches `role: 'vision'` and `providerId` to `ApiError` on failure.
- Update `researchSubject(subject, modelId, providerId)`:
  - Uses `providerId || state.orchestrator.researchProvider`.
  - Attaches `role: 'research'` and `providerId` to `ApiError` on failure.
- Implement `testProviderConnection(providerId)`:
  - Requests `${prov.base}/models` with provider auth header.
- Implement `fetchProviderModels(providerId, options)`:
  - Queries `/models` endpoint and returns normalized `{ id, name }` array.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api.test.js`
Expected: PASS

- [ ] **Step 5: Run all tests to ensure no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/api.js tests/api.test.js
git commit -m "feat: support arbitrary OpenAI endpoints in API client"
```

---

### Task 4: Orchestrator Multi-Provider Wiring in `src/orchestrator.js`

**Files:**
- Modify: `src/orchestrator.js`
- Modify: `src/elements.js`
- Modify: `tests/orchestrator.test.js`

**Interfaces:**
- Consumes: `getProvidersByCapability` from `src/providers.js`, `fetchProviderModels` from `src/api.js`
- Produces:
  - Vision provider selector dropdown & listener.
  - Research provider selector dropdown & listener.
  - Independent model refresh for Vision and Research.
  - Storage persistence of `visionProvider` and `researchProvider`.

- [ ] **Step 1: Write test for orchestrator cross-provider role settings**

In `tests/orchestrator.test.js`, add test cases:
- Selecting Vision Provider updates `state.orchestrator.visionProvider` and triggers model picker rebuild.
- Selecting Research Provider updates `state.orchestrator.researchProvider`.
- Prompt assembly and vision analysis invoke correct provider.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator.test.js`
Expected: FAIL

- [ ] **Step 3: Update `src/orchestrator.js` and `src/elements.js`**

- In `src/elements.js`, register new DOM elements:
  - `elements.visionProviderSelect`
  - `elements.researchProviderSelect`
- In `src/orchestrator.js`:
  - Render Vision Provider `<select>` with providers that support `chatVision`.
  - Render Research Provider `<select>` with providers that support `chatVision`.
  - On vision provider change: save to `state.orchestrator.visionProvider`, refresh model list for that provider.
  - On research provider change: save to `state.orchestrator.researchProvider`, populate research models for that provider.
  - Update `runVisionAnalysis` and `researchSubject` calls to pass the chosen provider id.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator.test.js`
Expected: PASS

- [ ] **Step 5: Run all tests to ensure no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator.js src/elements.js tests/orchestrator.test.js
git commit -m "feat: decouple vision and research providers in orchestrator"
```

---

### Task 5: Provider Management Modal & Sidebar UI in `index.html`, `src/styles.css`, and `src/app.js`

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `src/elements.js`
- Modify: `src/ui.js`
- Modify: `src/app.js`

**Interfaces:**
- Produces:
  - Provider management modal markup and styles.
  - Modal logic: Add new custom provider, edit provider, delete provider, test connection, show CORS info.
  - Sidebar Generation Provider selector supporting custom providers with `imageGen`.
  - Sync handlers updating all provider dropdowns when a provider is added, edited, or deleted.

- [ ] **Step 1: Add HTML markup for Provider Management Modal & Sidebar updates in `index.html`**

- In Sidebar:
  - Replace static OpenRouter/NanoGPT button group with dynamic Provider Selector `<select id="generationProviderSelect">` (or styled dropdown) and a "Manage Providers" button (`#manageProvidersBtn` ⚙️).
- In Orchestrator Advanced drawer:
  - Add `<div class="form-row"><label>Vision Provider</label><select id="visionProviderSelect"></select></div>`.
- In Orchestrator Subject Context drawer:
  - Add `<div class="form-row"><label>Research Provider</label><select id="researchProviderSelect"></select></div>`.
- Add Modal `#providerModal`:
  - Provider list with status badges ("Built-in", "Custom", "Active").
  - Form:
    - Provider Name (`#customProviderName`)
    - Base URL (`#customProviderBase`)
    - API Key (`#customProviderKey`)
    - Checkbox: Supports Image Generation (`#customProviderCapImage`)
    - Checkbox: Supports Chat / Vision (`#customProviderCapChat`)
    - Image Strategy dropdown: `/images/generations` vs chat modalities (`#customProviderStrategy`)
  - Actions: "Save Provider", "Test Connection", "Cancel".
  - CORS Help Callout explaining `OLLAMA_ORIGINS="*"`.

- [ ] **Step 2: Add styles in `src/styles.css`**

- Styles for `#providerModal`, provider list table/cards, capability badges, and CORS help banner.

- [ ] **Step 3: Implement Provider Management logic in `src/app.js` and `src/ui.js`**

- Wire `#manageProvidersBtn` to open `#providerModal`.
- Wire Form submission to `saveCustomProvider(...)`.
- Wire Delete button with confirmation.
- Wire "Test Connection" button calling `testProviderConnection(...)` with live spinner and status message.
- Call `rebuildAllProviderSelectors()` on save/delete to update:
  - Sidebar Generation Provider selector.
  - Vision Provider selector.
  - Research Provider selector.

- [ ] **Step 4: Run manual build & automated tests**

Run: `npm test`
Run: `npm run build`
Expected: PASS (build succeeded, all vitest tests pass)

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles.css src/elements.js src/ui.js src/app.js
git commit -m "feat: provider management modal and responsive role UI"
```

---

### Task 6: End-to-End Verification & Documentation Update

**Files:**
- Modify: `README.md`
- Test: `tests/`

- [ ] **Step 1: Write integration test for full cross-provider pipeline**

Create `tests/cross-provider.test.js`:
- Configure generation provider = `custom_mock_img` (`imageGen: true`).
- Configure vision provider = `custom_mock_vision` (`chatVision: true`).
- Verify Orchestrator prompt composition runs vision analysis against `custom_mock_vision`.
- Verify generation triggers against `custom_mock_img`.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Update `README.md`**

- Document custom OpenAI provider support.
- Add instructions for Ollama, Groq, Together, and LocalAI setup.
- Add section explaining CORS setup for local endpoints (`OLLAMA_ORIGINS=*`).
- Document cross-provider mixing in Orchestrator.

- [ ] **Step 4: Commit**

```bash
git add README.md tests/cross-provider.test.js
git commit -m "docs: document custom providers and cross-provider orchestration"
```
