# Vision Garment Description & NineGuard Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce false-positive refusals by making the Vision Analyst describe clothing as garments, shrink Vision uploads, make cached analyses version-aware, and add NineGuard as a one-click custom Provider usable for the Vision Analyst role (plus text-to-image in normal mode).

**Supersedes:** the earlier draft "Optimasi Token & Safe Prompting" (local `gemini-code-1778698681551.md`, deleted). Dropped from that draft, deliberately:
- Lexicon sanitizer / euphemism swapping, "Bypass AI Moderation" toggle, injected "wholesome…" clause. No moderation circumvention. Refusals surface as-is.
- Claim of ~65% token savings from downscaling: measured on NineGuard, 384/768/2048px images all cost 3097 prompt tokens. Downscale is kept for upload size/latency only.
- NineGuard image generation for Orchestrator: NineGuard/9router drops input images for `gemini-3.1-flash-image` (model replies "NO IMAGE", prompt_tokens equal text-only). Orchestrator generation stays on OpenRouter/NanoGPT.

**Vocabulary:** see `GLOSSARY.md` (Garment Description, Vision Analysis, Re-assemble, Provider, NineGuard, 9router).

**Tech Stack:** Vanilla JS ES modules, Vite, Vitest + JSDOM.

## Global Constraints
- All tests in `tests/` pass after every task (`npm test`).
- No API key, IP address or host of NineGuard committed to the repo.
- Backward compatible with existing `localStorage` (providers, keys, orchestrator state).
- No moderation-evasion logic of any kind.

## Verified facts (2026-10-09, NineGuard `test pi` key)
| Fact | Evidence |
|---|---|
| Model IDs are prefixed `9router/ag/...` | `GET /v1/models` → 375 models |
| No model lists `imageOutput:true` | `/models` capabilities |
| `9router/ag/gemini-3.1-flash-image` generates via chat completions + `modalities` | HTTP 200 |
| Image returned as markdown in `message.content`: `\n![image](data:image/jpeg;base64,...)` | raw response |
| Output always 1024×1024; `image_config.aspect_ratio`, `aspect_ratio`, `size` ignored | JPEG SOF parse |
| Input images not forwarded to the image model | "NO IMAGE" reply |
| `9router/ag/gemini-3.8-flash-low`, `3.7-flash-low` accept images, return JSON | "Red" on red test image |
| `9router/ag/gemini-3.5-flash-low` deprecated: 200 + SSE body "no longer available" | raw response |
| CORS: `OPTIONS` → 401, no `Access-Control-Allow-*`; endpoint is plain http | curl preflight |

---

### Task 1: Garment Description in `VISION_SYSTEM_PROMPT` + `ANALYSIS_VERSION`

**Files:** Modify `src/api.js`, `src/state.js`. Test `tests/api.test.js`.

**Produces:** `export const ANALYSIS_VERSION` (string, e.g. `'2'`) in `src/state.js`.

- [ ] **Step 1: Failing tests**

```js
import { VISION_SYSTEM_PROMPT } from '../src/api.js';
describe('VISION_SYSTEM_PROMPT', () => {
  it('asks for garment-centric clothing descriptions', () => {
    expect(VISION_SYSTEM_PROMPT).toMatch(/garment/i);
    expect(VISION_SYSTEM_PROMPT).toMatch(/neckline/i);
  });
  it('no longer uses body-part wording in its example', () => {
    expect(VISION_SYSTEM_PROMPT).not.toMatch(/thigh/i);
  });
  it('caps field length', () => {
    expect(VISION_SYSTEM_PROMPT).toMatch(/25 words/);
  });
  it('still lists all 21 keys', () => {
    const keys = VISION_SYSTEM_PROMPT.match(/^\s{2}(source|ref)_\w+/gm);
    expect(keys).toHaveLength(21);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run tests/api.test.js`
- [ ] **Step 3: Edit prompt.** Keep the 21-key list verbatim. Replace header paragraph with:
  - Each value: specific and concrete, **max 25 words**, comma-separated phrases allowed.
  - Clothing / accessories fields: **Garment Description**. Name garment type, cut, neckline, sleeve style, length (e.g. "knee-length", "mini-length"), material, color, trim/patterns. Describe the clothes, not the body or skin beneath them.
  - Good example: `"cream cable-knit sweater, pleated navy knee-length skirt, black loafers"`. Bad: `"casual outfit"`.
  - JSON-only rules unchanged.
- [ ] **Step 4: Add `ANALYSIS_VERSION = '2'`** in `src/state.js` with comment: bump whenever `VISION_SYSTEM_PROMPT` or Vision image preprocessing changes.
- [ ] **Step 5: Run tests, pass. Commit** `feat(vision): garment-centric analyst prompt`

---

### Task 2: Version-aware Vision cache

**Files:** Modify `src/orchestrator.js` (`isVisionCacheValid`, `getValidVisionCache`, cache write in `assembleOrchestratorPrompt`). Test `tests/orchestrator.test.js`.

**Interface change:** `isVisionCacheValid(cache, srcFp, refFp, model, version = ANALYSIS_VERSION)`. Cache entries gain `version`.

- [ ] **Step 1: Failing tests**
```js
it('rejects caches from an older analysis version', () => {
  const c = { srcFp: 's', refFp: 'r', model: 'm', version: '1', analysis: { source_char: 'x' } };
  expect(isVisionCacheValid(c, 's', 'r', 'm', '2')).toBe(false);
});
it('rejects legacy caches without a version', () => {
  const c = { srcFp: 's', refFp: 'r', model: 'm', analysis: { source_char: 'x' } };
  expect(isVisionCacheValid(c, 's', 'r', 'm', '2')).toBe(false);
});
```
Update existing cache fixtures in the file to include `version: ANALYSIS_VERSION`.
- [ ] **Step 2: Run, fail. Step 3: Implement** (add `&& cache.version === version`; write `version: ANALYSIS_VERSION` when caching).
- [ ] **Step 4: Run, pass. Commit** `feat(orchestrator): invalidate vision cache on analysis version change`

---

### Task 3: Downscale Vision inputs, `detail:'auto'`, `stream:false`

**Files:** Modify `src/api.js` (`runVisionAnalysis`, `researchSubject`, `runImageEdit`, chat-modalities generation). Test `tests/api.test.js`.

**Produces:** `export const VISION_MAX_DIM = 1024`, `VISION_JPEG_QUALITY = 0.8` in `src/api.js`.
`runVisionAnalysis` gains optional dep injection for tests: `runVisionAnalysis(src, ref, model, providerId, { compress = compressDataUri } = {})`.

- [ ] **Step 1: Failing tests** (mock `global.fetch`, capture body):
```js
it('downscales both images before sending to vision', async () => {
  const calls = [];
  const compress = async (uri, max, q) => { calls.push([max, q]); return 'data:image/jpeg;base64,SMALL'; };
  global.fetch = async (_u, init) => { body = JSON.parse(init.body); return okJson({ choices: [{ message: { content: '{}' } }] }); };
  await runVisionAnalysis('data:image/png;base64,A', 'data:image/png;base64,B', 'm', 'openrouter', { compress });
  expect(calls).toEqual([[1024, 0.8], [1024, 0.8]]);
  const imgs = body.messages[1].content.filter(p => p.type === 'image_url');
  expect(imgs.every(p => p.image_url.url.endsWith('SMALL') && p.image_url.detail === 'auto')).toBe(true);
  expect(body.stream).toBe(false);
});
it('falls back to original image if compression throws', async () => { /* compress rejects → original URIs sent */ });
```
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement.** `Promise.all` compress both; on error log `console.warn` and use originals. `detail: 'auto'` in vision + `runImageEdit`; generation references keep `detail:'high'` (unchanged quality for donors). Add `stream: false` to every `/chat/completions` body in `api.js`.
- [ ] **Step 4: Run, pass. Commit** `perf(vision): send 1024px JPEG to analyst; explicit non-streaming`

---

### Task 4: Markdown image extraction

**Files:** Modify `src/api.js` (`extractImageFromMessage`). Test `tests/api.test.js`.

- [ ] **Step 1: Failing tests**
```js
it('reads a markdown data-URI image in string content', () => {
  const m = { content: '\n![image](data:image/jpeg;base64,/9j/AAA=)' };
  expect(extractImageFromMessage(m)).toBe('data:image/jpeg;base64,/9j/AAA=');
});
it('reads a markdown https image in string content', () => {
  expect(extractImageFromMessage({ content: 'Here: ![x](https://cdn.example/a.png) done' })).toBe('https://cdn.example/a.png');
});
it('reads markdown image inside a text part of array content', () => {
  expect(extractImageFromMessage({ content: [{ type: 'text', text: '![i](data:image/png;base64,QQ==)' }] })).toBe('data:image/png;base64,QQ==');
});
it('ignores non-image markdown links', () => {
  expect(extractImageFromMessage({ content: '[docs](https://x.y)' })).toBeNull();
});
```
- [ ] **Step 2: Run, fail. Step 3: Implement** helper `findMarkdownImage(text)` with regex `/!\[[^\]]*\]\(\s*(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+)\s*\)/i`; called after existing checks for string content and for `type:'text'` parts. Result still flows through existing `sanitizeImageUrl` at render sites.
- [ ] **Step 4: Run, pass. Commit** `feat(api): extract images returned as markdown`

---

### Task 5: Provider-level image capabilities (`imageConfigStyle`, aspect support, known models)

**Files:** Modify `src/providers.js`, `src/api.js` (`generateSingleImage` chat path, `fetchProviderModels`). Test `tests/providers.test.js`, `tests/api.test.js`.

**Provider config additions (all optional, persisted for custom providers):**
- `imageConfigStyle: 'gemini' | 'flat' | 'none'` — how aspect ratio is sent on chat-modalities. Default: OpenRouter = derive per model (current behaviour), custom = `'flat'`.
- `supportsAspectRatio: boolean` (default `true`).
- `knownModels: Array<{ id, name, kind: 'image'|'vision', supportsImageInput, notes }>` — merged into model lists and `MODEL_CONFIGS`, because some gateways omit models from `/models`.

- [ ] **Step 1: Failing tests**
  - `saveCustomProvider` round-trips `imageConfigStyle`, `supportsAspectRatio`, `knownModels`.
  - chat-modalities body: provider `imageConfigStyle:'gemini'` → `image_config.aspect_ratio` set even if model id lacks `google/` and `supportsImageSize` false; `'flat'` → top-level `aspect_ratio`; `supportsAspectRatio:false` → neither.
  - OpenRouter body unchanged for `google/gemini-2.5-flash-image` (regression).
  - `fetchProviderModels(customId)` returns `/models` list **plus** `knownModels` (dedup by id; known entries win for `supportsImageInput`), and writes `MODEL_CONFIGS[id]` for known image models with `supportsImageInput` from config.
- [ ] **Step 2: Run, fail. Step 3: Implement.** Replace `state.selectedModel.includes('gemini')` checks with a `resolveImageConfigStyle(prov, modelId, modelConfig)` helper; OpenRouter branch keeps current logic.
- [ ] **Step 4: Run, pass. Commit** `feat(providers): per-provider image config style and known models`

---

### Task 6: Orchestrator img2img filter for all providers

**Files:** Modify `src/app.js` (`syncGenerationPickerConstraints`). Test `tests/cross-provider.test.js` or new `tests/generation-constraints.test.js`.

- [ ] **Step 1: Failing test:** with orchestrator enabled and a custom provider whose selected model has `supportsImageInput:false`, constraint sync enables img2img filter and switches to first img2img-capable model of that provider (or shows warning toast if none).
- [ ] **Step 2: Run, fail. Step 3: Implement:** drop `state.provider === 'nanogpt'` condition; pool = live models for provider → `knownModels` → (NanoGPT) allowlist. If pool has no img2img model: keep selection, show one-time toast "Selected provider has no model that accepts reference images; Orchestrator results will ignore Source/Reference images".
- [ ] **Step 4: Run, pass. Commit** `fix(orchestrator): require img2img models on every provider`

---

### Task 7: Custom Generation model ID input

**Files:** Modify `index.html` (sidebar generation model section), `src/elements.js`, `src/app.js`, `src/state.js`. Test `tests/model-picker.test.js` or `tests/state.test.js`.

**State:** `state.generationModelCustom` persisted per provider at `imagen_model_custom_${providerId}`. Effective model = custom (trimmed) if non-empty, else picker selection — mirror of `visionModelCustom`.

- [ ] **Step 1: Failing test:** effective-model helper `getEffectiveGenerationModel()` returns custom when set, picker value otherwise; persistence per provider.
- [ ] **Step 2: Run, fail. Step 3: Implement** input under generation picker, placeholder "Or paste a model ID…"; replace direct `state.selectedModel` reads in generation path (`generateSingleImage`, `generateImages` batch metadata) with helper. Unknown custom IDs get `MODEL_CONFIGS` fallback `{ name: id, supportsImageInput: false, supportsAspectRatio: true }`.
- [ ] **Step 4: Run, pass. Commit** `feat(generation): custom model ID input`

---

### Task 8: NineGuard template in Custom Provider modal

**Files:** Modify `src/providers.js`, `index.html` (provider form), `src/app.js`, `src/elements.js`. Test `tests/provider-modal.test.js`, `tests/providers.test.js`.

**Produces:** `export const PROVIDER_TEMPLATES = { nineguard: {...} }` in `src/providers.js`:
```js
nineguard: {
  name: 'NineGuard',
  // Absolute: #providerFormBase is <input type="url">, relative paths fail validation.
  base: import.meta.env?.DEV ? `${location.origin}/nineguard/v1` : '',
  imageStrategy: 'chat-modalities',
  capabilities: { imageGen: true, chatVision: true },
  imageConfigStyle: 'none',
  supportsAspectRatio: false,
  defaultVisionModel: '9router/ag/gemini-3.8-flash-low',
  knownModels: [
    { id: '9router/ag/gemini-3.8-flash-low', name: 'Gemini 3.8 Flash Low', kind: 'vision' },
    { id: '9router/ag/gemini-3.7-flash-low', name: 'Gemini 3.7 Flash Low', kind: 'vision' },
    { id: '9router/ag/gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image (text-to-image, 1:1)', kind: 'image',
      supportsImageInput: false, notes: 'NineGuard currently drops input images; output fixed 1024×1024.' }
  ],
  notice: 'Browser builds need the Vite proxy (/nineguard) or a NineGuard with CORS + https. Desktop build connects directly.'
}
```
No key, host or IP in the template.

- [ ] **Step 1: Failing tests:** clicking "Use NineGuard template" fills name/base/strategy/caps, leaves key empty, shows notice; saving persists `knownModels`, `supportsAspectRatio:false`. In non-DEV base is empty and form validation asks for it.
- [ ] **Step 2: Run, fail. Step 3: Implement** a "Templates" row (button `#providerTemplateNineguard`) at top of `#providerEditForm`; template notice replaces the Ollama CORS tip while active. Generation picker shows "1:1 only" hint and disables aspect-ratio control when `supportsAspectRatio === false`.
- [ ] **Step 4:** Vision role: when user picks NineGuard as Vision Provider and current vision model is not in its list, preselect `defaultVisionModel`.
- [ ] **Step 5: Run, pass. Commit** `feat(providers): NineGuard template`

---

### Task 9: Vite dev/preview proxy + env hygiene

**Files:** Modify `vite.config.js`, `.gitignore`. Create `.env.example`.

- [ ] **Step 1:** `.gitignore` add:
```
.env
.env.*
!.env.example
```
- [ ] **Step 2:** `.env.example`:
```
# Upstream for the /nineguard dev proxy (no trailing slash). Copy to .env.local.
NINEGUARD_TARGET=http://your-nineguard-host:port
```
- [ ] **Step 3:** `vite.config.js` → function form using `loadEnv(mode, process.cwd(), '')`; when `NINEGUARD_TARGET` set, add to both `server.proxy` and `preview.proxy`:
```js
'/nineguard': { target: env.NINEGUARD_TARGET, changeOrigin: true, rewrite: p => p.replace(/^\/nineguard/, '') }
```
Note: Vite registers proxy middleware before its `base` middleware, so `/nineguard` is proxied even though app `base` is `/lazy-imagen-openrouter/`. Confirm in Step 4; if it 404s, move proxy key and template base under `${BASE_URL}nineguard`.
- [ ] **Step 4: Manual verify:** `npm run dev`, add NineGuard via template, paste key, Test Connection → success; Vision analysis on two images returns JSON.
- [ ] **Step 5: Commit** `build: NineGuard dev proxy via NINEGUARD_TARGET`

---

### Task 10: Docs

**Files:** Modify `README.md` (tracked). `docs/USER_GUIDE.md`, `docs/ARCHITECTURE.md` are git-ignored local notes: update them too, but they do not ship.

- [ ] README "Providers → NineGuard": template usage, `.env.local` + proxy, roles (Vision ✔, T2I ✔ 1:1, Orchestrator generation ✘ until upstream forwards input images), CORS/https requirement for Pages.
- [ ] ARCHITECTURE: `ANALYSIS_VERSION`, Vision downscale, provider capability fields.
- [ ] USER_GUIDE: Garment Description rationale; refusal handling (switch Vision model/provider, no prompt laundering).
- [ ] Commit `docs: NineGuard provider and garment-centric vision`

---

## Verification checklist
- [ ] `npm test` green.
- [ ] Vision request body: both images ≤1024px JPEG, `detail:'auto'`, `stream:false` (DevTools Network).
- [ ] Re-assemble after toggling Lighting: toast "no tokens spent", no network call.
- [ ] After bumping `ANALYSIS_VERSION`, first Assemble re-runs Vision once.
- [ ] Vision via NineGuard (`9router/ag/gemini-3.8-flash-low`) on an anime costume pair: JSON parses; clothing fields read as garments.
- [ ] Normal mode T2I via NineGuard: image renders (markdown extraction), aspect control shows "1:1 only".
- [ ] Orchestrator + NineGuard as Generation provider: img2img filter/warning shown.
- [ ] `git grep -n "43.129\|sk-ng-"` → no matches.

## Upstream follow-ups (NineGuard / 9router, outside this repo)
1. Forward input images to `ag/gemini-3.1-flash-image` (currently dropped).
2. Answer `OPTIONS` preflight without auth (204 + `Access-Control-Allow-Origin/Headers/Methods`); add `Access-Control-Allow-Origin` on responses.
3. Serve over https with a domain.
4. List image-output models in `/v1/models` with `imageOutput:true`.
5. Deprecated models: return 4xx error, not 200 + SSE text.
