# lazy-imagen-openrouter

> The lazy developer's UI for OpenRouter. Upload two images, click a few checkboxes, and let the tool write the complex image-to-image prompts for you. It chains a vision model to automatically extract metadata from a Source and Reference image, allowing users to effortlessly transfer poses, clothing, and styles — all without typing a prose prompt.

## 📖 Origin & Credits

This project is a modified fork of the excellent [imagen-openrouter](https://github.com/yusufipk/imagen-openrouter) by yusufipk.

As per the original project, this modified software remains open-source and is licensed under the **GPL-3.0 License**.

![Imagen UI](assets/UI.webp)
![Imagen UI-1](assets/UI-1.webp)

## ✨ Features

### 🧩 Orchestrator Mode
- **No-typing image-to-image** — upload a Source image (character) and a Reference image (style/pose/clothes), tick checkboxes for what to transfer, and let a vision model assemble the prompt automatically.
- **9 transfer toggles** — Clothing, Pose/Body, Background, Facial Expression, Hair, Lighting, Color Palette, Accessories, Camera/Framing — with **All/None** quick buttons and a live count.
- **Workflow presets** — one-click Outfit swap / Pose copy / Full style transfer / Scene swap, plus save-your-own presets.
- **Cached vision analysis** — change toggles after assembling and **re-assemble instantly for free**; only swapping images or the vision model triggers a new paid analysis.
- **⇄ Swap button, drag-from-gallery, Recent images strip** — get the right image into the right slot fast; an **Iterate: use as Source** button feeds a generated result back in for another pass.
- **Readiness chips** — see at a glance what's missing (Source / Reference / API key / image-capable model) before clicking Generate.
- **3-way Art Style picker** — Source, Reference, or Blend, with a clearly highlighted selection.
- **Identity Lock** — choose how strictly to preserve the Source character's face (Low → Maximum).
- **Creativity slider** — 0–100, dials between "stay faithful" and "allow creative reinterpretation".
- **Customizable Vision Analyst** — 10 curated picks (Gemini Flash/Pro, GPT-4o, Claude Sonnet, Qwen-VL, Llama Vision) plus a free-text custom model ID override.
- **Subject Context with web research** — describe subjects the model doesn't know, or click 🔍 to auto-research via Perplexity Sonar.
- **Editable prompt preview** — char count, copy button, and a "settings changed — re-assemble" badge so a stale prompt never surprises you.
- **Mobile-friendly workspace** — side-by-side slots, compact toggle grid, sticky Generate footer at phone sizes.

### 📊 Model Info Cards
Every model dropdown shows pricing (live, from `/api/v1/models`), best-for descriptors, speed indicator, context window, and capability summary.

### 🎨 Multi-Model Support
- **Gemini 2.5 Flash Image** — Google's fast image generation
- **Gemini 2.5 Flash (Preview)** — Preview version with latest features
- **Gemini 3.1 Flash (Preview)** — Newer Gemini preview image model
- **Gemini 3 Pro (Preview)** — Advanced model, up to 14 reference images
- **GPT-5 Image** — OpenAI's latest image model
- **GPT-5 Image Mini** — Faster, smaller GPT-5 variant
- **Flux 2 Pro / Max / Flex / Klein** — Black Forest Labs models
- **Seedream 4.5** — ByteDance's image model
- **Riverflow V2** — Fast/Standard/Max variants

### 📐 Flexible Output Options
- **Resolution**: 1K, 2K, 4K (Gemini models)
- **Aspect Ratios**: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2
- **Batch Generation**: Up to 8 images at once

### 🔍 Image Tools: Upscaler (no AI, no tokens)
- Enlarge any image **2×–4× entirely in your browser** — classic Lanczos resampling via [pica](https://github.com/nodeca/pica), not an AI call, so it costs nothing
- Works on gallery images or local uploads (file picker, drag & drop, paste); each tool tab keeps its own image, and **× Change image** swaps in another without reopening
- Optional sharpening, **split-view compare slider** against the original (drag the slider or the image), PNG/JPEG export
- Save results straight back into the gallery
- Tip: generate at a cheap resolution, upscale locally for free

### ✂️ Image Tools: Background Removal (no AI by default)
- **Auto-detect** flood-fills the background from the image borders, tuned to stop at anti-aliased edges — solid, gradient, and pastel backdrops all work, with an adjustable tolerance slider. A wiped result auto-retries at lower tolerance, then reverts with an explanation instead of showing a blank board
- **Keep / Remove brushes** fix anything the auto-detect missed; **Smart select (magic wand)** turns a single click into a whole-region selection that removes or restores the connected color area
- **✨ Optional AI assist** for stubborn backgrounds: a vision model repaints the background a solid key color which is chroma-keyed away locally — **charges your OpenRouter account (≈ $0.04)** and always asks for confirmation with the estimate first
- Edge feathering, undo/redo (`Ctrl+Z`/`Ctrl+Y`), `[` `]` brush sizing, checkerboard transparency preview
- Exports a transparent PNG or saves back to the gallery

### 🖼️ Reference Image Support
- Upload unlimited reference images
- Drag & drop **anywhere on the page** (full-screen drop overlay), paste with `Ctrl+V`
- Use generated images as references
- References survive page reloads
- Click X to remove individual references

### 💾 Persistent Storage
- **IndexedDB storage**
- Store hundreds of images
- Images, references, and notification history persist across browser sessions

### 🎯 Gallery Features
- View all generated images
- **Search** by prompt text or filter by model; **star favorites** and filter to favorites only
- Hover actions: copy to clipboard, download, delete, use as reference, recreate, edit in Image Tools
- Click any image for full view + metadata; flip through with `←`/`→`
- Approximate **cost estimate** under the Generate button (for models with known per-image prices)
- Export / import the whole gallery as JSON; clear gallery option

### ♻️ Recreate Feature
- Click any image to restore its original settings
- Instantly iterate on previous generations

### ❓ Built-in Help & Onboarding
- `?` button in the sidebar (or press `?`) opens a sectioned guide covering every feature
- A welcome guide opens automatically on your first visit

### 📱 Installable PWA
- Install Imagen as an app from your browser's address bar
- The app shell loads offline; your gallery is already local, so browsing past images works without a connection (generation still needs network)

## 🚀 Quick Start

1. Clone this repository.
2. Install dependencies and start the dev server (the app imports npm modules, so a plain static file server won't work):
   ```bash
   npm install
   npm run dev
   ```
3. Open the URL Vite prints (default http://localhost:5173).
4. Paste your OpenRouter API key into the **OpenRouter API Key** field in the sidebar, then click **Save Key**. The key is stored only in your browser's `localStorage` — it never leaves your machine except in API requests to OpenRouter.
5. Pick a **Model** from the dropdown. The info card below shows what each model is best for, its speed, and (once pricing loads) its cost per million tokens / per image.
6. Type a prompt in the main textarea and click **Generate**.

That's the manual flow. The rest of the guide covers **Orchestrator Mode**.

## 🔑 Getting an OpenRouter API Key

1. Go to [OpenRouter](https://openrouter.ai/).
2. Create an account.
3. Navigate to **Keys** section.
4. Create a new API key.
5. Copy and paste it into the tool.

### A note on free models

Orchestrator Mode makes up to three OpenRouter calls per generation:

| Call | Free options available? |
| --- | --- |
| **Vision analyst** (extracts metadata from Source + Reference) | ✅ Yes — Vision Analyst dropdown entries with **(free)** in the name use OpenRouter's free tier ($0 per call, rate-limited). |
| **Subject research** (Perplexity Sonar) | ❌ Paid only. |
| **Image generation** | ❌ Paid only — no free image-generation models on OpenRouter as of this writing. |

Manual prompt mode skips the vision call entirely and only uses the (paid) image-generation model.

### A note on content restrictions

Every image-generation model currently available on OpenRouter is from Google (Gemini Image / "Nano Banana") or OpenAI (GPT-5, GPT-5.4 Image). Both have moderate-to-strict content policies. **Anime-permissive providers (Flux, Stable Diffusion, NovelAI, Pony) are not on OpenRouter as of this writing.**

If the **vision step** (Assemble Prompt) refuses your images — symptom is an "undefined" prompt or a "Vision response was not valid JSON" error — switch the Vision Analyst Model in the **Advanced** drawer to **Qwen2.5-VL 72B** or **Llama 3.2 90B Vision**. Both are open-weight and significantly more permissive at describing character/anime content.

If the **image generation step** refuses, try **GPT-5.4 Image 2** (different content-policy thresholds than Gemini) or simplify the assembled prompt before clicking Generate.

## 🧩 Orchestrator Mode — User Guide

Orchestrator Mode is for **image-to-image** work where you want to take a character from one image and combine them with elements (outfit, pose, background, etc.) from another image, without writing a prose prompt yourself.

The flow is:

```
You upload:     Source Image (character)   +   Reference Image (style donor)
You click:      checkboxes for what to transfer
App calls:      a vision model → extracts structured metadata from both images
App builds:     a final prompt from that metadata + your checkbox state
App sends:      that prompt + both images to the generation model
You get:        an image with Source character wearing Reference clothing, etc.
```

### Step 1 — Turn on Orchestrator Mode

In the sidebar, find the **Orchestrator Mode** section and flip the toggle switch in its header. The panel expands. The main prompt textarea becomes read-only — it'll show the assembled prompt after you click Generate.

### Step 2 — Upload your two images

- **Source Image (Character)** — the person/character whose face and identity you want to keep.
- **Reference Image (Style/Pose/Clothes)** — the image with elements you want to transfer.

Either click the slot, drag-drop an image file onto it, or **drag a gallery card straight onto the slot**. Click the **×** in the corner to clear a slot, the **⇄** button between the slots to swap the two images, or pick from the **Recent** strip (your last six role images) under the slots.

### Step 3 — Pick what to transfer

The **Transfer from Reference** checkboxes control which attributes come from the Reference image. Unchecked attributes stay from the Source. Use the **All / None** buttons for quick sweeps, or apply a **preset** chip (Outfit swap, Pose copy, Full style transfer, Scene swap) — "+ Save current…" remembers your own combinations.

| Toggle | When checked | When unchecked |
| --- | --- | --- |
| **Clothing** | Use Reference's outfit | Use Source's outfit |
| **Pose / Body** | Use Reference's pose | Use Source's pose |
| **Background** | Use Reference's setting | Use Source's setting |
| **Facial Expression** | Use Reference's expression | Use Source's expression |
| **Hair** | Use Reference's hairstyle and color | Use Source's hair |
| **Lighting** | Use Reference's lighting setup | Use Source's lighting |
| **Color Palette** | Use Reference's color scheme | Use Source's palette |
| **Accessories** | Use Reference's jewelry/glasses/hats | Use Source's accessories |
| **Camera / Framing** | Use Reference's shot type and angle | Use Source's framing |

The character's identity (face, body shape) is **always** taken from Source — that's the whole point.

### Step 4 — Art Style

Three options:

- **Use Source style** — final image renders in the Source's art style.
- **Use Reference style** — final image renders in the Reference's art style.
- **Blend both** — instructs the model to mix the two styles.

### Step 5 — Identity Lock & Creativity

- **Identity Lock** — how strictly to preserve the Source character's face:
  - *Low* — allow significant variation (use when you want a re-imagining).
  - *Medium* — preserve the facial identity (general likeness).
  - *High* — strong facial consistency (default; good for most cases).
  - *Maximum* — explicit "100% facial identity" directive (use when you need a near-exact face match).
- **Creativity** — slider from 0 to 100:
  - Below 20 → adds "stay faithful to source composition" to the prompt.
  - Above 60 → adds "allow creative reinterpretation of secondary details".
  - In between → no extra clause (let the model decide).

### Step 6 — Pick a Vision Analyst Model

The Vision Analyst is the model that reads both images and produces the structured JSON used to assemble the prompt. It's a separate call from the image-generation call.

| Model | When to use |
| --- | --- |
| **Gemini 2.5 Flash** | Default. Fast, cheap, accurate JSON output. |
| **Gemini 2.0 Flash** | Cheapest option. Use when running many iterations. |
| **Gemini 2.5 Pro** | Highest extraction detail. Slower and more expensive. |
| **GPT-4o Mini** | Fast OpenAI option with strong JSON adherence. |
| **GPT-4o** | Best for subtle scene description. |
| **GPT-4.1 Mini** | Newer OpenAI vision; good cost/quality balance. |
| **Claude 3.5 Sonnet** | Excellent visual reasoning. |
| **Claude Sonnet 4** | Best for subtle style + composition reads. |
| **Qwen2.5-VL 72B** | Open-weights; strong on anime/illustration. |
| **Llama 3.2 90B Vision** | Open-weights; general purpose. |

You can also paste any OpenRouter model ID into the **custom override** field — it takes precedence over the dropdown.

### Step 7 — Subject Context (when the model doesn't know your subject)

Image models have training cutoffs. If you're generating something obscure, recent, or custom (e.g. a niche anime character, a freshly released product, a custom IP, a real person), the model may not know what they look like. The **Subject Context** field lets you describe them in prose.

Two ways to fill it:

1. **Type it yourself** — describe physical features, signature outfits, color schemes, etc.
2. **Click the 🔍 Research button** — this calls a Perplexity Sonar model via OpenRouter to look the subject up on the web and write a 3-6 sentence description for you. Pick the tier with **Research with:** dropdown:
   - *Sonar* — cheapest, good for well-known subjects.
   - *Sonar Pro* — deeper research, more sources.
   - *Sonar Reasoning* — best for obscure or ambiguous subjects.

The Research button is disabled until you type at least a subject name (otherwise it'd have nothing to search for). If you click Research and the field already has content, you'll be asked to confirm before overwriting.

The subject context is prepended to the assembled prompt as a grounding statement.

### Step 8 — Generate

Click **Generate**. You'll see the button label change to **Analyzing images…** while the vision call runs, then the assembled prompt appears in the **Assembled prompt preview**. The actual image generation starts immediately after. The **readiness chips** in the footer show beforehand whether anything is missing (images, API key, image-capable model).

**Re-assembling is free:** the vision analysis of your image pair is cached. If you change toggles, style, identity lock, creativity or notes afterwards, a *"settings changed — re-assemble (free)"* badge appears — clicking Assemble then rebuilds the prompt instantly with **zero tokens spent**. Only changing an image or the vision analyst triggers a new paid analysis (the **Re-analyze** button forces one manually).

**Iterating:** open any generated image and click **Iterate: use as Source** to feed the result back in as the new Source for another pass.

### Reading the Model Info card

Every model dropdown shows a compact info card below it:

```
Gemini 2.5 Flash Image
Best for: Recommended default — fast generation and edits
⚡ fast    Context: 1M tokens
$0.075 / 1M prompt tokens
$0.30 / 1M completion tokens
$0.0001 / image
Image input: yes · max 3 references
Strong all-rounder. Supports image-to-image with up to 3 references.
```

- **Best for** — one-sentence summary of when to use this model.
- **Speed / Context** — `⚡ fast`, `◐ medium`, or `🐢 slow`; context window size.
- **Pricing** — live values pulled from `https://openrouter.ai/api/v1/models` (cached for 24 hours). If pricing fails to load (e.g. you're offline), this section is omitted.
- **Caps** — whether the model accepts reference images and how many.
- **Notes** — extra context.

For a custom model ID typed into the override field, the card shows "Info unavailable for custom IDs."

### Troubleshooting

**"Vision analysis failed: …"** — the vision model couldn't process your images or returned malformed JSON. Common causes:
- Your API key has no credit for the chosen vision model.
- The custom model ID you pasted doesn't exist or doesn't support vision.
- The chosen model is rate-limited.
The orchestrator falls back to whatever's in the textarea, so a previous assembled prompt may still generate something usable.

**"Doesn't support image input"** — Orchestrator Mode requires a generation model that accepts reference images. Switch to a Gemini, GPT-5 Image, or other vision-capable model. Flux, Seedream, and Riverflow are text-to-image only.

**"Could not save orchestrator state — uploaded images may be too large"** — orchestrator settings live in `localStorage` (~5MB quota) while the Source/Reference images themselves persist in IndexedDB. If this appears, the settings snapshot failed but the current session still works fine; the images usually survive a refresh regardless.

**Research button stays disabled** — type at least a few characters into the Subject Context field. The button enables once the field is non-empty.

**The assembled prompt doesn't match my toggles** — the assembled prompt only refreshes when you click Generate (since assembling requires a vision call). Click Generate to see the latest prompt in the preview.

## 🧰 Image Tools — User Guide

Both tools run **entirely in your browser** with classic image processing (no AI, no API calls, zero credits). Open them from:

- the **sliders icon** on any gallery card (hover to reveal),
- the **Edit** button in the full-image view,
- the **Image Tools** button in the gallery toolbar — this one also takes local files (click, drag-drop, or paste).

Opening from the gallery loads the image into **both** tools; uploads inside the editor go to the active tab only, so the Upscaler and Background Removal can work on different images. **× Change image** (top-left of the canvas) clears the active tab back to the upload prompt.

### Upscaler

1. Pick a scale (2×/3×/4× — options that would exceed 32 MP or 8192px are disabled with a reason).
2. Optionally tick **Sharpen** and pick PNG or JPEG output.
3. Click **Upscale**. Resampling runs in web workers; big images take a few seconds and can be cancelled.
4. **Compare with original** opens a split view — drag the slider (or the image itself) to move the divider between the naive original and the resampled result. Then **Download** or **Save to Gallery**.

💡 Money-saver: generate at 1K, then upscale locally for free instead of paying for a 2K/4K generation. There's also a tip under the Generate button with one-click **Copy prompt** — paste it (plus your images) into Google Gemini or another free tool and spend zero OpenRouter credits.

### Background Removal

1. Opening the tab runs **Auto-detect** immediately: it samples the image borders and flood-fills everything that looks like background, stopping at anti-aliased subject edges. Raise or lower **Tolerance** and re-run to tune it. A result that would wipe almost the whole image automatically retries at half tolerance (the slider follows), and reverts with a warning if that fails too.
2. Fix the rest by hand: the **Remove** brush erases, **Keep** restores. Tick **Smart select (magic wand)** and a single click removes or restores the *whole connected color region* — ideal for clearing big background patches or rescuing an over-removed area in one click.
3. For stubborn, busy backgrounds, **✨ AI assist** sends the image to Gemini via OpenRouter to repaint the background a solid key color, which is then removed locally. **This costs ≈ $0.04 per attempt** — a confirmation with the estimate appears before anything is charged, and the AI's version of the image replaces your working copy.
4. **Edge feather** softens the cutout boundary. `Ctrl+Z`/`Ctrl+Y` undo/redo whole strokes; `[` `]` resize the brush.
5. **Download PNG** (with transparency) or **Save to Gallery**.

## 📱 Install as App (PWA)

Imagen ships a web-app manifest and service worker:

- In Chrome/Edge, click the **install icon** in the address bar (or ⋮ → *Install app*). On iOS Safari: Share → *Add to Home Screen*.
- The app shell is cached, so the UI loads offline; your gallery already lives in IndexedDB, so browsing past images works without a connection.
- Generation, pricing, and research still require network (they call OpenRouter).
- Updates install automatically on the next load after a deploy.

## 🔒 Privacy & Security

This is a **100% client-side application**:

- ✅ API keys are stored in YOUR browser only
- ✅ Generated images are stored in YOUR browser only (IndexedDB)
- ✅ No data is sent to any server except OpenRouter API
- ✅ Safe to deploy as a static website

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Enter` | Generate images |
| `Escape` | Close any modal |
| `?` | Open the help guide |
| `←` / `→` | Previous / next image in the viewer |
| `Ctrl/Cmd + V` | Paste image as reference (or into Image Tools when open) |
| `[` / `]` | Shrink / grow the brush (Background Removal) |
| `Ctrl + Z` / `Ctrl + Y` | Undo / redo brush strokes (Background Removal) |

## 🛠️ Tech Stack

- **Frontend**: ES-module vanilla HTML/CSS/JavaScript — single runtime dependency: [pica](https://github.com/nodeca/pica) for the client-side upscaler
- **Build / Dev**: Vite (bundling, content-hashed assets) + vite-plugin-pwa (manifest + service worker) + Vitest (tests) + ESLint + Prettier — dev-only
- **API**: OpenRouter for model access
- **Storage**: IndexedDB for images/references + localStorage for settings and notification history
- **Styling**: Custom CSS with CSS variables
- **CI / Deploy**: GitHub Actions → GitHub Pages

## 📁 Project Structure

```
lazy-imagen-openrouter/
├── .github/
│   └── workflows/
│       ├── ci.yml          # Lint + test + build on PRs / non-master pushes
│       └── deploy.yml      # Auto-deploy to GitHub Pages on push to master
├── src/                    # ES module sources (see Development → Architecture)
├── tests/                  # Vitest test suites
├── public/
│   └── icons/              # PWA icons (generated by scripts/generate-icons.mjs)
├── scripts/
│   └── generate-icons.mjs  # One-off icon generation (sharp)
├── assets/                 # Screenshots
├── index.html              # Main entry point
├── favicon.svg
├── vite.config.js          # Vite + PWA (manifest, service worker) config
├── vitest.config.js
├── package.json
└── README.md               # This file — full user guide
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- npm 9+

### Getting Started

```bash
npm install        # Install dev dependencies
npm run dev        # Start Vite dev server with hot-reload
npm run build      # Production build to dist/
npm run preview    # Preview the production build locally
npm test           # Run test suite (Vitest)
npm run test:watch # Run tests in watch mode
npm run lint       # Lint source files
npm run lint:fix   # Auto-fix lint issues
npm run format     # Format with Prettier
```

### Architecture

All source code lives in `src/` as ES modules. The only runtime dependency is `pica` (image resampling for the upscaler):

| Module | Responsibility |
|--------|---------------|
| `app.js` | Entry point, module initialization, event wiring |
| `orchestrator.js` | Orchestrator mode: prompt assembly, error classification |
| `api.js` | OpenRouter API fetch wrappers |
| `retry.js` | Exponential backoff retry utility |
| `utils.js` | Pure utilities (escapeHtml, debounce, sanitizeImageUrl, clipboard, etc.) |
| `state.js` | Constants, model configs, shared state |
| `elements.js` | Cached DOM references |
| `db.js` | IndexedDB wrapper for image persistence |
| `ui.js` | Sidebar, modal, focus trap, cost estimate, layout helpers |
| `gallery.js` | Gallery rendering, search/filter, favorites, management |
| `image-tools.js` | Image Tools editor shell (upscale + background removal UI) |
| `upscaler.js` | Client-side upscaling via pica (Lanczos resampling) |
| `bg-removal.js` | Pure background-removal algorithms (flood fill, masks, brushes) |
| `help.js` | Help guide modal and first-visit onboarding |
| `history.js` | Prompt history with favorites |
| `notifications.js` | Notification history (persisted to localStorage) |
| `export-import.js` | Gallery export/import |
| `accessibility.js` | ARIA patterns, keyboard navigation |
| `theme.js` | Dark/light theme toggle |

### Browser Requirements

The app relies on modern web APIs:

- ES modules (`<script type="module">`)
- IndexedDB (image persistence)
- Clipboard API with `ClipboardItem` (copy prompt/image — image copy requires Chrome/Edge/Safari; Firefox needs a flag)
- Pointer Events + Canvas 2D (Image Tools brushes and compositing)
- Service Worker (PWA install + offline shell — optional, the app works without it)
- CSS custom properties (theming)
- Optional chaining and nullish coalescing (ES2020)

Supported browsers: Chrome 90+, Firefox 90+, Edge 90+, Safari 15+.

## 🚀 Deployment

This repo auto-deploys to GitHub Pages on every push to `master` via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The workflow:

1. Sets up Node 22 with `actions/setup-node` (npm cache).
2. Runs `npm ci` to install dev dependencies.
3. Runs `npm run build` — Vite emits content-hashed asset filenames into `dist/`, which gives natural cache busting (return visitors only re-download files whose content actually changed).
4. Drops `dist/.nojekyll` so Pages doesn't try to Jekyll-process the site.
5. Writes `dist/version.txt` containing `deployed=<7-char SHA>` you can `curl` to confirm which commit is live.
6. Uploads `dist/` and ships via `actions/deploy-pages`.

**One-time setup** (only needed once per repo): in **Settings → Pages**, set **Source: GitHub Actions**.

You can also trigger a deploy manually from the **Actions** tab via *Run workflow* on the *Deploy to GitHub Pages* workflow.

To confirm a deploy landed:

```bash
curl https://<your-user>.github.io/lazy-imagen-openrouter/version.txt
# → deployed=<short-sha>
```

> **Subpath note:** `vite.config.js` sets `base: '/lazy-imagen-openrouter/'` so the built `dist/` references assets under the GitHub Pages subpath. If you fork to a different repo name (or use a custom domain), update that `base` accordingly.

### CI checks

A companion [`ci.yml`](.github/workflows/ci.yml) runs on every PR to `master` and on pushes to any non-`master` branch. It runs `npm ci` → `npm run lint` → `npm test` → `npm run build`. A green build here is the strongest single signal that the next deploy will succeed; a failing build blocks the PR before broken code reaches `master`.

## 📜 License

This project is licensed under the **GNU General Public License v3.0** (GPL-3.0).

You are free to:
- ✅ Use this software for any purpose
- ✅ Study how the software works and modify it
- ✅ Distribute copies of the software
- ✅ Distribute modified versions

Under the condition that:
- 📋 You include the original license and copyright notice
- 📋 You disclose the source code when distributing
- 📋 Modified versions must also be licensed under GPL-3.0

See the [LICENSE](LICENSE) file for full details.
