# Architecture

Developer-facing reference for the app structure, especially Orchestrator Mode.

## Code layout

```
index.html      — single HTML entry point (sidebar + main panel + modal)
src/app.js      — all application logic (vanilla JS, no build step)
src/styles.css  — all styling (single dark theme, CSS variables)
favicon.svg     — app icon
docs/           — this folder
```

No bundler. No dependencies. The browser loads `app.js` directly.

## High-level flow

There are two codepaths through `generateImages()` at [src/app.js](../src/app.js):

```
                ┌─────────────────────────────┐
                │  generateImages() entry     │
                └──────────────┬──────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
   state.orchestrator.enabled === true     === false
              │                                 │
              ▼                                 │
   runVisionAnalysis(source, ref, model)        │
              │                                 │
              ▼                                 │
   assemblePrompt(visionJson, prefs)            │
              │                                 │
              ▼                                 │
   set textarea.value = assembled               │
   state.references = [source, ref]             │
              │                                 │
              └────────────────┬────────────────┘
                               │
                               ▼
                  Existing generation loop:
                  for i in count:
                    generateSingleImage(prompt, modelConfig)
                       → POST /api/v1/chat/completions
                       → parse multi-format image response
                       → store in IndexedDB
                       → prependImageCard()
```

When orchestrator mode is **off**, the pre-step is skipped entirely. The existing flow is unchanged.

## State

The runtime state lives in a single `state` object near the top of [src/app.js](../src/app.js).

New fields for this feature:

| Field | Persistence | Purpose |
| --- | --- | --- |
| `state.modelPricing` | `sessionStorage` (24h TTL) | Per-model pricing from OpenRouter `/api/v1/models` |
| `state.orchestrator` | `localStorage` (key `imagen_orchestrator`) | All orchestrator UI state (toggles, sliders, images, etc.) |

`state.orchestrator` is loaded via `loadOrchestratorState()` and saved via `saveOrchestratorState()`. The save is called on every state change. If the localStorage quota is exceeded (base64 images can be large), it toasts a warning but doesn't throw — the in-memory state still works for the session.

## Pure functions

Functions in this category have no DOM side effects and no I/O — easy to test, easy to reason about.

| Function | Purpose |
| --- | --- |
| `assemblePrompt(visionJson, prefs)` | Composes the final image-generation prompt from vision metadata + user preferences |
| `speedGlyph(speed)` | `'fast'` → `'⚡ fast'`, etc. |
| `formatPrice(perToken)` | OpenRouter per-token price → display-ready per-1M string |
| `loadOrchestratorState()` | Returns a hydrated orchestrator state from localStorage |

## I/O functions

| Function | Endpoint | Purpose |
| --- | --- | --- |
| `runVisionAnalysis(srcB64, refB64, modelId)` | `POST /api/v1/chat/completions` | Sends both images + system prompt asking for a structured JSON description. Defensive JSON parse (handles models that wrap output in code fences). Throws on failure. |
| `researchSubject(text, modelId)` | `POST /api/v1/chat/completions` | Calls a Perplexity Sonar model with the subject as text. Returns 3-6 sentence factual description. |
| `fetchModelPricing()` | `GET /api/v1/models` | Public endpoint, no auth. Populates `state.modelPricing`. Cached for 24h in sessionStorage. |
| `generateSingleImage(prompt, modelConfig)` | `POST /api/v1/chat/completions` | Existing function — unchanged. Used by both flows. |

## DOM rendering

| Function | Purpose |
| --- | --- |
| `enhanceGenerationModelDropdown()` | Adds a "best for" subtitle to each option in the existing model dropdown (turning it into a `.rich` dropdown) |
| `setupOrchestrator()` | Populates dropdowns + restores DOM state from `state.orchestrator` on init |
| `renderModelInfoCard(modelId, target, meta)` | Renders the info card under a model dropdown |
| `renderRoleThumb(role, dataUri)` / `clearRoleThumb(role)` | Show/hide the source or reference image thumbnail |
| `setupRoleDropzone(role)` | Wires drag-drop + file input + clear button for one image slot |
| `setupOrchestratorEventListeners()` | Hooks all orchestrator inputs to state mutations + persistence |

## Initialization order

In `init()`:

1. Restore API key, references, model dropdown (using enhanced version), quality/size, aspect ratio, image count.
2. Call `setupOrchestrator()` — populates vision/research dropdowns and restores the orchestrator UI from localStorage.
3. Load gallery from IndexedDB and render.
4. Call `setupEventListeners()` — also calls `setupOrchestratorEventListeners()`.
5. Render initial model info cards (without pricing).
6. Fire `fetchModelPricing()` in the background. When it resolves, re-render the info cards with pricing data.

## How to add a new transfer attribute

Three edits:

1. Add the key to `ATTRIBUTE_KEYS` in [src/app.js](../src/app.js) (currently informational, but kept in sync for future iteration).
2. Add a `<label class="toggle-row">` row in [index.html](../index.html) under the `Transfer from Reference` block, with `data-attr="newkey"`.
3. Add `source_newkey` and `ref_newkey` lines to the `VISION_SYSTEM_PROMPT` string in [src/app.js](../src/app.js) so the analyst extracts them.

Then add a line to `assemblePrompt` that uses `pick('newkey')` in the right spot of the sentence template.

## How to add a new generation model

One edit: add an entry to `MODEL_CONFIGS` in [src/app.js](../src/app.js). Required fields: `name`, `supportsImageSize`, `supportsAspectRatio`, `supportsImageInput`, `maxReferences`, `bestFor`, `speed`, `notes`. Pricing is filled at runtime.

Also add a `<div class="custom-select-option">` entry to the model dropdown in [index.html](../index.html). `enhanceGenerationModelDropdown()` will pick up the new `bestFor` subtitle automatically.

## How to add a new vision or research model

Add an object to `VISION_MODELS` or `RESEARCH_MODELS` in [src/app.js](../src/app.js). The dropdowns are populated dynamically — no HTML edit needed.

## Persistence summary

| Key | Storage | TTL | Contents |
| --- | --- | --- | --- |
| `imagen_api_key` | localStorage | forever | OpenRouter API key |
| `imagen_model` | localStorage | forever | Selected generation model ID |
| `imagen_size`, `imagen_quality`, `imagen_aspect_ratio`, `imagen_count` | localStorage | forever | Generation settings |
| `imagen_orchestrator` | localStorage | forever | All orchestrator UI state (JSON blob) |
| `imagen_model_pricing` | sessionStorage | 24h | Per-model pricing from `/api/v1/models` |
| `ImagenDB` (IndexedDB) | persistent | forever | All generated images (full base64) |

## Files reference

- The original Gemini-generated spec is preserved at [docs/ORCHESTRATOR_SPEC.md](ORCHESTRATOR_SPEC.md) for historical reference. The as-built implementation extends it; see [USER_GUIDE.md](USER_GUIDE.md) for the user-facing version.
- A long-form model reference is at [docs/MODELS.md](MODELS.md).
