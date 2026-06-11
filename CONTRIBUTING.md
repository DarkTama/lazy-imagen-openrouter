# Contributing to lazy-imagen-openrouter

Thank you for your interest in contributing! This document covers everything you need to get started.

## Project Overview

lazy-imagen-openrouter is a client-side web application for AI image generation via OpenRouter. Its signature feature is **Orchestrator Mode**, which chains a vision model to automatically extract metadata from a Source and Reference image, letting users transfer poses, clothing, and styles between images without writing complex prompts.

## Prerequisites

- **Node.js** 18+ (for dev tooling only - the app itself runs entirely in the browser)
- A modern browser: Chrome, Firefox, or Edge (latest two versions)
- An OpenRouter API key (for runtime testing)

## Setup

```bash
git clone https://github.com/<your-fork>/lazy-imagen-openrouter.git
cd lazy-imagen-openrouter
npm install
npm run dev
```

This starts a Vite dev server with hot-reload at `http://localhost:5173`.

## Architecture

The project is a vanilla JS single-page application using ES modules. The only runtime dependency is [pica](https://github.com/nodeca/pica) (high-quality image resampling for the client-side upscaler).

```
src/
  app.js           - Application entry point; initializes modules and wires event listeners
  orchestrator.js  - Orchestrator mode logic: prompt assembly, error classification, UI setup
  api.js           - Fetch wrappers for OpenRouter API calls (vision, generation, research)
  retry.js         - Exponential backoff retry utility for transient failures
  utils.js         - Pure utility functions (escapeHtml, debounce, sanitizeImageUrl, etc.)
  state.js         - Application constants, model configs, and shared mutable state
  elements.js      - Cached DOM element references
  db.js            - IndexedDB wrapper for persistent image storage
  ui.js            - Sidebar, modal, focus trap, and UI helper functions
  gallery.js       - Gallery rendering, search/filter, favorites, image management
  image-tools.js   - Image Tools editor shell (upscale + background removal UI)
  upscaler.js      - Client-side upscaling via pica (Lanczos resampling)
  bg-removal.js    - Pure background-removal algorithms (flood fill, masks, brushes)
  help.js          - Help guide modal and first-visit onboarding
  history.js       - Prompt history with favorites
  notifications.js - Notification history system (persisted to localStorage)
  export-import.js - Gallery export/import functionality
  accessibility.js - ARIA patterns and keyboard navigation
  theme.js         - Dark/light theme toggle
  styles.css       - All application styles
scripts/
  generate-icons.mjs - One-off PWA icon generation (outputs committed to public/icons/)
```

### Key patterns

- **ES modules** - All files use `import`/`export`. No CommonJS, no bundler plugins for transforms.
- **Minimal runtime dependencies** - The browser bundle only includes `pica` (image resampling). Everything else is hand-rolled; dev dependencies are for tooling only.
- **CSS custom properties** - Theming uses variables like `--bg-primary`, `--text-primary`, defined in `:root` and toggled via a `.light-theme` class.
- **ARIA patterns** - Interactive widgets (custom selects, modals, sliders) follow WAI-ARIA authoring practices.
- **State management** - A single mutable `state` object in `state.js`; no framework, no store library.
- **IndexedDB** - Large blobs (generated images, orchestrator source/reference) persist in IndexedDB via the `db.js` wrapper.

## Coding Conventions

- Write ES2020+ JavaScript (optional chaining, nullish coalescing, etc.)
- Avoid new runtime dependencies - if you need a utility, add it to `src/utils.js` (pica is the deliberate exception)
- Use CSS custom properties for any new colors or spacing values
- Follow existing ARIA patterns for interactive widgets
- Keep functions small and focused; prefer pure functions where possible
- Use `showToast()` from `src/utils.js` for user-facing messages

## Testing

```bash
npm test          # Run all tests once
npm run test:watch  # Run tests in watch mode (re-runs on file change)
```

Tests live in the `tests/` directory with a `.test.js` suffix. The test runner is [Vitest](https://vitest.dev/) with a jsdom environment for DOM APIs.

When adding a new utility or module:
1. Create `tests/<module-name>.test.js`
2. Import the functions under test directly
3. Use `describe`/`it`/`expect` from Vitest (globals are enabled)
4. Mock DOM or timers with `vi.fn()`, `vi.useFakeTimers()`, etc.

## Linting and Formatting

```bash
npm run lint      # Check for lint errors
npm run lint:fix  # Auto-fix lint errors
npm run format    # Format all source files with Prettier
```

ESLint is configured with `eslint-config-prettier` to avoid conflicts with Prettier. The config lives in `.eslintrc.json` and formatting rules in `.prettierrc`.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - A new feature or user-visible enhancement
- `fix:` - A bug fix
- `chore:` - Tooling, config, or maintenance (no production code change)
- `docs:` - Documentation only
- `refactor:` - Code restructuring without behavior change

Examples:
```
feat: add batch download for gallery images
fix: prevent crash when IndexedDB is unavailable
chore: update vitest to 3.1.0
docs: add troubleshooting section to README
```

## Pull Request Workflow

1. Branch from `improvement-plan` (the active development branch):
   ```bash
   git checkout improvement-plan
   git pull
   git checkout -b feat/my-feature
   ```
2. Make your changes, keeping commits atomic and well-described.
3. Run the full check suite:
   ```bash
   npm run lint
   npm test
   ```
4. Push your branch and open a PR targeting `master`.
5. Describe what changed and why in the PR body.
6. Address any review feedback with new commits (do not force-push during review).

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 License that covers this project.
