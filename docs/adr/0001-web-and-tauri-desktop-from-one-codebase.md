# 0001 — Web and Tauri desktop from one codebase

Status: accepted

## Context

App ships as static web app on GitHub Pages. Browser rules block calls to some Providers:

- Self-hosted gateways (e.g. NineGuard) answer CORS preflight with 401 and send no `Access-Control-Allow-*` headers.
- Pages is https; browsers block calls to plain `http://` endpoints (mixed content) no matter what CORS says.

Fixing this server-side (CORS + TLS on every gateway) is outside this repo's control. Vite dev proxy only helps during `npm run dev`.

## Decision

Keep web build (GitHub Pages) and add Tauri v2 desktop build from same frontend source.

- Desktop sends HTTP from native side, so CORS and mixed content do not apply.
- Web stays first-class; desktop is an additional shell, not a fork.
- CI: existing Pages deploy unchanged; new tag-triggered workflow builds desktop installers and publishes them to GitHub Releases (pattern from openterm).

## Alternatives rejected

- **Web only**: users of non-CORS / http gateways need a proxy or server changes they may not control.
- **Desktop only**: drops zero-install access via Pages.

## Consequences

- Build must support two bases (`/lazy-imagen-openrouter/` for Pages, `/` for Tauri) and disable PWA service worker in desktop build.
- Network calls need one seam that works in both shells.
- Release pipeline needs Rust toolchain and per-OS runners.
- Plain-http Providers are reachable from desktop but traffic is unencrypted; app cannot fix that.
