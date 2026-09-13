# Specification: OpenAI-Compatible Custom Providers & Cross-Provider Orchestration

- **Date:** 2026-09-13
- **Status:** Draft
- **Approach:** Approach 1 (Dynamic Provider Store + Unified Provider Interface)

---

## 1. Overview

Extend Imagen to support arbitrary OpenAI-compatible API providers (e.g. Ollama, Groq, Together AI, DeepInfra, LocalAI, vLLM) alongside built-ins (OpenRouter, NanoGPT). Enable fully decoupled, cross-provider workflows where image generation, vision analysis, and web research can each target different providers independently.

---

## 2. Core Requirements

1. **Custom Provider CRUD**:
   - Add, edit, delete, and list custom OpenAI-compatible endpoints.
   - Configure Base URL, optional API key, custom headers, and capabilities (`imageGen`, `chatVision`).
   - Store custom provider configurations locally in `localStorage`.
   - Built-in providers (OpenRouter, NanoGPT) remain protected and non-deletable.

2. **Decoupled Role-Based Provider Assignment**:
   - **Generation Role**: Configured in Sidebar (`generationProvider` + `selectedModel`).
   - **Vision Analyst Role**: Configured in Orchestrator Advanced drawer (`visionProvider` + `visionModel`).
   - **Research Role**: Configured in Orchestrator Subject Context drawer (`researchProvider` + `researchModel`).
   - Each role independently loads its own API key and model cache for the chosen provider.

3. **Unified OpenAI-Compatible API Execution**:
   - **Image Generation**:
     - `chat-modalities` for OpenRouter Gemini.
     - `images-endpoint` (`/v1/images/generations`) for NanoGPT and custom providers supporting `imageGen`.
     - Standardized response parsing supporting both Base64 (`b64_json`) and remote URLs (`url`).
   - **Chat / Vision Analysis**:
     - Standard OpenAI `/v1/chat/completions` with multi-modal content (`image_url` parts).
   - **Web Research**:
     - Standard OpenAI `/v1/chat/completions` with prompt and system guidance.
   - **Model Discovery**:
     - Standard `/v1/models` endpoint discovery. Free-text model input allowed when model list is empty or unsupported.

4. **Error Attribution & Diagnostics**:
   - `ApiError` identifies originating `role` (`'generation' | 'vision' | 'research'`) and `providerId`.
   - UI toasts show which exact service failed.
   - In-modal connection test for validating Base URL and Auth.
   - CORS guidance for local providers (e.g. Ollama `OLLAMA_ORIGINS="*"`, LM Studio CORS headers).

---

## 3. Data Structures & State Architecture

### 3.1 Provider Schema (`src/providers.js`)
```typescript
interface ProviderConfig {
  id: string;                      // Unique ID (slug or custom_<timestamp>)
  name: string;                    // Display label (e.g. "Local Ollama", "Groq")
  base: string;                    // Base URL (e.g. "http://localhost:11434/v1")
  keyPlaceholder?: string;
  keyLabel?: string;
  keyNote?: string;
  isBuiltIn: boolean;              // true for 'openrouter' and 'nanogpt'
  capabilities: {
    imageGen: boolean;             // Appears in Generation Provider select
    chatVision: boolean;           // Appears in Vision & Research Provider select
  };
  imageStrategy: 'images-endpoint' | 'chat-modalities';
  defaultModel?: string;
  imagesUrl?: string;              // Optional override
  modelsUrl?: string;              // Override or default to `${base}/models`
}
```

### 3.2 State Shape Updates (`src/state.js`)
```javascript
export const state = {
  // Generation
  generationProvider: 'openrouter',
  selectedModel: 'google/gemini-2.5-flash-image',

  // Orchestrator
  orchestrator: {
    ...ORCHESTRATOR_DEFAULTS,
    visionProvider: 'openrouter',
    visionModel: 'google/gemini-2.5-flash',
    researchProvider: 'openrouter',
    researchModel: 'perplexity/sonar'
  },

  // Per-provider model cache
  fetchedModels: {
    // [providerId]: { image: [], vision: [], chat: [] }
  }
};
```

### 3.3 Storage Migration
- Legacy keys `imagen_provider` migrated to `imagen_generation_provider`.
- Per-provider keys preserved:
  - `imagen_api_key_<providerId>`
  - `imagen_remember_key_<providerId>`
  - `imagen_model_<providerId>`
  - `imagen_vision_model_<providerId>`
  - `imagen_research_model_<providerId>`
- Custom providers list stored in `imagen_custom_providers` as JSON.

---

## 4. Component Changes

### 4.1 `src/providers.js`
- Export `BUILTIN_PROVIDERS` map (`openrouter`, `nanogpt`).
- Manage custom provider persistence (`loadCustomProviders`, `saveCustomProvider`, `deleteCustomProvider`).
- Export query helpers:
  - `getAllProviders()`
  - `getProvider(id)`
  - `getProvidersByCapability('imageGen' | 'chatVision')`

### 4.2 `src/api.js`
- Refactor `providerFetchArgs` to accept `providerId`.
- Add `testProviderConnection(providerId)`.
- Enhance `generateSingleImage` to handle generic `/images/generations` responding with either `b64_json` or `url`.
- Refactor `runVisionAnalysis` and `researchSubject` to use role-specific provider and key.
- Enhance `fetchProviderModels(providerId)` to hit `/v1/models` and filter/normalize entries.

### 4.3 `src/orchestrator.js`
- Add provider pickers for Vision Analyst and Web Research.
- Wire change events: changing Vision Provider refreshes Vision Model picker for that provider.
- Wire change events: changing Research Provider refreshes Research Model picker.

### 4.4 `src/ui.js` & `src/app.js` & `index.html`
- Add **Manage Providers** button in Sidebar next to Provider toggle.
- Create Provider Management Modal in `index.html`:
  - List configured providers with status chips.
  - Create/Edit form: Name, Base URL, API Key, Checkboxes (`Image Generation`, `Chat / Vision`), and Image Generation Strategy.
  - Test connection button with status feedback.
  - Local AI / CORS guidance box.
- Update sidebar to populate Generation Provider select with `imageGen`-capable providers.

---

## 5. Testing Strategy

1. **Unit Tests (`tests/providers.test.js`)**:
   - Custom provider CRUD (add, update, delete, persist).
   - Filter providers by capability.
   - Built-in provider immutability.
2. **API Tests (`tests/api.test.js`)**:
   - Generation with custom `images-endpoint` provider (mocking `b64_json` and `url`).
   - Vision analysis with custom provider.
   - Error attribution (`ApiError` carries `providerId` and `role`).
3. **Orchestrator Tests (`tests/orchestrator.test.js`)**:
   - Role provider switching and model syncing.
   - Fallback behavior if configured provider is deleted.
