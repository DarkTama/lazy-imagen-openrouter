# Tauri Desktop Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the existing web app as a Tauri v2 desktop app from the same codebase, so Providers without CORS/https (e.g. NineGuard) work directly, and API keys live in the OS keyring instead of `localStorage`.

**Decision record:** `docs/adr/0001-web-and-tauri-desktop-from-one-codebase.md`.

**Prerequisite:** `docs/superpowers/plans/2026-10-09-vision-garment-nineguard.md` merged (provider capability fields, NineGuard template).

**Reference project:** `../openterm` (Tauri v2, `keyring`, `tauri-action` release workflow, updater).

**Tech Stack:** Tauri v2, Rust (reqwest, keyring, serde), Vanilla JS, Vite, Vitest.

## Decisions (from design session)
| Topic | Decision |
|---|---|
| Targets | Web (GitHub Pages) **and** desktop, one frontend source |
| Identity | Product "Lazy Imagen", identifier `io.github.darktama.lazyimagen` |
| HTTP | Generic Rust command `provider_fetch`; Rust injects `Authorization` from keyring. API logic stays in JS. No `tauri-plugin-http`, no wide URL scope |
| Keys | Desktop: OS keyring. Web: `localStorage`/`sessionStorage` as today. One `keyStore` seam |
| Version | `package.json` is single source; `tauri.conf.json` reads `"version": "../package.json"`; release tag `vX.Y.Z` must equal it (CI fails otherwise) |
| CI | `deploy.yml` (Pages) untouched. New `release.yml` on tag `v*` → draft GitHub Release with Windows/macOS/Linux installers |
| Distribution | Local builds first. Publishing Releases to other users waits for NineGuard https (plain http sends key unencrypted) |

## Global Constraints
- Web build behaviour unchanged; `npm test` green after every task.
- No API key ever returned from Rust to JS on desktop (write-only from JS's view, except "has key" boolean).
- No hardcoded hosts/keys. Updater private key only in GitHub secrets.
- Desktop build: `base: '/'`, PWA service worker disabled.

## Architecture

```
JS (api.js / app.js / image-tools.js)
   │  providerRequest(providerId, url, init)        ← single seam
   ├─ web:     fetch(url, { headers: + Authorization from keyStore })
   └─ desktop: invoke('provider_fetch', { providerId, url, method, headers, body })
                  Rust: key = keyring(identifier, "provider:<id>")
                        reqwest → { status, headers, body (text) }
```

`provider_fetch` takes a full URL (custom Providers have arbitrary bases). Authorization is attached only when a key exists for `providerId`. Response is returned as text; JS wraps it in a `Response`-like object (`ok`, `status`, `text()`, `json()`) so existing call sites keep working.

Non-provider fetches (e.g. `image-tools.js` fetching an image URL, OpenRouter public `/models`) go through `providerRequest(null, url)` → no auth.

---

### Task 1: `keyStore` seam (web implementation first)

**Files:** Create `src/key-store.js`. Modify `src/state.js` (`loadApiKeyForProvider` + save paths), `src/app.js` (key save/remember/clear). Test `tests/key-store.test.js`, `tests/state.test.js`.

**Produces:**
```js
export const keyStore = {
  async get(providerId),          // web only; desktop returns null (key never leaves Rust)
  async has(providerId),          // boolean
  async set(providerId, key, { remember }),
  async remove(providerId),
};
export function isDesktop()       // '__TAURI_INTERNALS__' in window
```
- [ ] **Step 1:** Failing tests for web impl: `set` with `remember:true` → `localStorage['imagen_api_key_<id>']`; `remember:false` → `sessionStorage['imagen_api_key_session_<id>']`; `get`/`has`/`remove` mirror current behaviour (state.js:12).
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; route existing key read/write call sites through it. `state.apiKey` stays as in-memory cache **on web only**.
- [ ] **Step 4:** Run full suite, pass. Commit `refactor: keyStore seam for provider API keys`

---

### Task 2: `providerRequest` seam (web implementation)

**Files:** Create `src/http.js`. Modify `src/api.js` (12 `fetch(` sites, `providerFetchArgs`), `src/app.js` (2 sites: test key, model fetch), `src/image-tools.js` (1 site). Test `tests/http.test.js`, existing api/provider tests.

**Interface change:** `providerFetchArgs(providerId)` → returns `{ providerId, provider, base, headers /* no Authorization */, request(url, init) }`. Callers use `request` instead of `fetch` + key headers. `prov.headers(key)` stays for header shape but key is attached inside `providerRequest`.

- [ ] **Step 1:** Failing tests: `providerRequest('openrouter', url, init)` calls `fetch` with `Authorization: Bearer <key>` from keyStore; `providerRequest(null, url)` sends no auth; errors from `fetch` propagate (network `ApiError` mapping unchanged).
- [ ] **Step 2:** Run, fail. **Step 3:** Implement; migrate all 15 call sites. `git grep -n "fetch(" src/` afterwards must show only `src/http.js`.
- [ ] **Step 4:** Run full suite (existing tests mocking `global.fetch` must still pass). Commit `refactor: route all network calls through providerRequest`

---

### Task 3: Tauri scaffold + dual build modes

**Files:** Create `src-tauri/` (`Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`, `tauri.conf.json`, `capabilities/default.json`, `icons/`). Modify `package.json`, `vite.config.js`, `.gitignore`.

- [ ] **Step 1:** `npm i -D @tauri-apps/cli@^2` and `npm i @tauri-apps/api@^2`. Scripts:
  ```json
  "tauri": "tauri",
  "build:desktop": "vite build --mode desktop"
  ```
- [ ] **Step 2:** `vite.config.js`: `mode === 'desktop'` → `base: '/'`, skip `VitePWA`, `server.port: 1420`, `strictPort: true`, `clearScreen: false`. Other modes unchanged.
- [ ] **Step 3:** `tauri.conf.json`:
  ```json
  {
    "$schema": "https://schema.tauri.app/config/2",
    "productName": "Lazy Imagen",
    "version": "../package.json",
    "identifier": "io.github.darktama.lazyimagen",
    "build": {
      "beforeDevCommand": "npm run dev -- --mode desktop",
      "devUrl": "http://localhost:1420",
      "beforeBuildCommand": "npm run build:desktop",
      "frontendDist": "../dist"
    },
    "app": {
      "windows": [{ "label": "main", "title": "Lazy Imagen", "width": 1400, "height": 900, "minWidth": 900, "minHeight": 600 }],
      "security": { "csp": "<see Task 6>", "capabilities": ["default"] }
    },
    "bundle": { "active": true, "targets": "all", "icon": ["icons/32x32.png","icons/128x128.png","icons/128x128@2x.png","icons/icon.icns","icons/icon.ico"] }
  }
  ```
- [ ] **Step 4:** Icons: `npx tauri icon public/icons/icon-512.png`.
- [ ] **Step 5:** `.gitignore`: `src-tauri/target/`, `src-tauri/gen/schemas/` (keep consistent with openterm).
- [ ] **Step 6:** Verify `npm run tauri dev` opens the app; web `npm run build` output unchanged (`dist/index.html` asset paths still prefixed `/lazy-imagen-openrouter/`).
- [ ] **Step 7:** Commit `feat(desktop): Tauri v2 scaffold with desktop build mode`

---

### Task 4: Rust keyring commands + desktop `keyStore`

**Files:** `src-tauri/Cargo.toml` (`keyring = "4"`, `serde`, `thiserror`), `src-tauri/src/keys.rs`, `src-tauri/src/lib.rs`, `src/key-store.js`. Tests: Rust unit tests with mock keyring builder where possible; JS test with mocked `invoke`.

**Commands:**
- `key_set(provider_id: String, key: String) -> Result<(), String>`
- `key_has(provider_id: String) -> Result<bool, String>`
- `key_remove(provider_id: String) -> Result<(), String>`
- (no `key_get` exposed)

Entry: `keyring::Entry::new(IDENTIFIER, &format!("provider:{provider_id}"))`. `NoEntry` → `has=false`, `remove` ok. Pattern from `openterm/src-tauri/src/totp.rs`.

- [ ] **Step 1:** JS failing test: with `isDesktop()` true and mocked `invoke`, `keyStore.set` calls `key_set`, `get` returns `null`, `has` calls `key_has`; `remember` flag ignored (keyring is always persistent).
- [ ] **Step 2:** Implement Rust + JS. **Step 3:** One-time migration on desktop start: for each provider with a `localStorage` key, `key_set` then delete from `localStorage`/`sessionStorage`.
- [ ] **Step 4:** UI: key input shows "•••• saved in system keychain" placeholder when `has`; "Remember key" checkbox hidden on desktop.
- [ ] **Step 5:** `cargo test`, `npm test`. Commit `feat(desktop): store provider keys in OS keyring`

---

### Task 5: Rust `provider_fetch` + desktop `providerRequest`

**Files:** `src-tauri/Cargo.toml` (`reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }`, `tokio`), `src-tauri/src/http.rs`, `src-tauri/src/lib.rs`, `src/http.js`. Tests: Rust tests against a local `httpmock`/`wiremock` server; JS test with mocked `invoke`.

**Command:**
```rust
#[tauri::command]
async fn provider_fetch(provider_id: Option<String>, url: String, method: String,
                        headers: HashMap<String,String>, body: Option<String>)
    -> Result<FetchResult, String>
// FetchResult { status: u16, headers: HashMap<String,String>, body: String }
```
Rules:
- Only `http`/`https` schemes; reject others.
- Strip any `Authorization` header coming from JS; add `Bearer <key>` from keyring when `provider_id` has one.
- Timeout 180 s (image generation can take ~20 s; leave headroom). Body size cap 50 MB.
- Network errors → `Err("network: …")` mapped by JS to `ApiError{kind:'network'}`.
- Never log key or full body.

- [ ] **Step 1:** Rust tests: auth injected from (mock) key store; JS-supplied Authorization dropped; non-http scheme rejected; status/body passthrough on 4xx.
- [ ] **Step 2:** JS tests: desktop `providerRequest` returns object with `ok`, `status`, `text()`, `json()`; maps invoke rejection to thrown `TypeError`-like network error so existing `catch (netErr)` paths work.
- [ ] **Step 3:** Implement. **Step 4:** Manual: desktop app, NineGuard Provider with Base URL `http://<host>:<port>/v1` (no proxy), Test Connection + Vision analysis succeed.
- [ ] **Step 5:** Commit `feat(desktop): native provider_fetch with keyring auth`

---

### Task 6: Desktop security hardening

**Files:** `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`.

- [ ] CSP: `default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ipc: http://ipc.localhost; script-src 'self' 'wasm-unsafe-eval'` — adjust after checking bg-removal/upscaler needs (WASM, workers, model downloads); document each allowance.
- [ ] Capabilities: `core:default` + app commands only (`key_set`, `key_has`, `key_remove`, `provider_fetch`). No shell, no fs, no http plugin.
- [ ] Verify bg-removal and upscaler still work in desktop build.
- [ ] Commit `chore(desktop): CSP and minimal capabilities`

---

### Task 7: Release workflow

**Files:** Create `.github/workflows/release.yml`. Modify `README.md`.

- [ ] Trigger: `push: tags: ['v*']` + `workflow_dispatch`.
- [ ] Job `verify-version` (ubuntu): fail unless `${GITHUB_REF_NAME#v}` == `node -p "require('./package.json').version"`.
- [ ] Job `build` (needs verify-version), matrix `windows-latest`, `macos-latest`, `ubuntu-22.04`:
  - Linux deps (same list as openterm release.yml).
  - `actions/setup-node@v4` (node 22), `npm ci`.
  - `dtolnay/rust-toolchain@stable`, `swatinem/rust-cache@v2` (`workspaces: src-tauri`).
  - `tauri-apps/tauri-action@v0` with `tagName: ${{ github.ref_name }}`, `releaseName: 'Lazy Imagen ${{ github.ref_name }}'`, `releaseDraft: true`, `prerelease: false`.
- [ ] Permissions: `contents: write`.
- [ ] `deploy.yml` untouched; confirm both workflows run on a test tag in a fork/branch.
- [ ] README: "Desktop app" section (download from Releases, unsigned-installer warnings on Windows/macOS, keys in OS keychain, direct connection to http Providers is unencrypted).
- [ ] Commit `ci: build desktop installers on version tags`

---

### Task 8 (deferred until Releases go public): Auto-updater

- [ ] Generate signing key (`npx tauri signer generate`), add `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` secrets.
- [ ] `tauri-plugin-updater` + `tauri-plugin-process`; `plugins.updater.endpoints = ["https://github.com/DarkTama/lazy-imagen-openrouter/releases/latest/download/latest.json"]`; `bundle.createUpdaterArtifacts: true`.
- [ ] release.yml: secret presence check, `uploadUpdaterJson: true`, `updaterJsonPreferNsis: true` (pattern from openterm).
- [ ] In-app "Check for updates".

---

## Verification checklist
- [ ] `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml` green.
- [ ] Web: `npm run build` → Pages artefact identical in structure; PWA still registers.
- [ ] Desktop: NineGuard over plain http works without proxy; OpenRouter/NanoGPT unchanged.
- [ ] Desktop: DevTools → `localStorage` has no `imagen_api_key_*`; keys visible in OS credential manager under `io.github.darktama.lazyimagen`.
- [ ] Desktop: `invoke('provider_fetch', { url: 'file:///etc/passwd', … })` rejected.
- [ ] Tag `v1.0.1` with `package.json` at `1.0.0` → `verify-version` fails.
- [ ] Tag matching version → draft Release with installers for 3 OS.

## Open risks
- Large base64 payloads over IPC (2 × ~2 MB refs + ~1.5 MB response): measure latency in Task 5; if poor, switch to `tauri::ipc::Response` raw bytes.
- macOS/Windows unsigned installers trigger OS warnings; code signing out of scope.
- `bg-removal.js` / upscaler may fetch WASM/models from CDNs; CSP in Task 6 must allow exactly those origins.
