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
- **9 transfer toggles** — Clothing, Pose/Body, Background, Facial Expression, Hair, Lighting, Color Palette, Accessories, Camera/Framing.
- **3-way Art Style picker** — Source, Reference, or Blend.
- **Identity Lock** — choose how strictly to preserve the Source character's face (Low → Maximum).
- **Creativity slider** — 0–100, dials between "stay faithful" and "allow creative reinterpretation".
- **Customizable Vision Analyst** — 10 curated picks (Gemini Flash/Pro, GPT-4o, Claude Sonnet, Qwen-VL, Llama Vision) plus a free-text custom model ID override.
- **Subject Context with web research** — describe subjects the model doesn't know, or click 🔍 to auto-research via Perplexity Sonar.
- **Read-only prompt preview** — see exactly what was sent to the generation model.

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

### 🖼️ Reference Image Support
- Upload unlimited reference images
- Drag & drop support
- Use generated images as references
- Click X to remove individual references

### 💾 Persistent Storage
- **IndexedDB storage**
- Store hundreds of images
- Images persist across browser sessions

### 🎯 Gallery Features
- View all generated images
- Delete individual images (hover to reveal 🗑️ button)
- Click any image for full view + metadata
- Clear entire gallery option

### ♻️ Recreate Feature
- Click any image to restore its original settings
- Instantly iterate on previous generations

## 🚀 Quick Start

1. Clone this repository.
2. Start a local server:
   ```bash
   python3 -m http.server 8080
   # or
   npx serve .
   ```
3. Open http://localhost:8080.
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

Either click the slot or drag-drop an image file onto it. Click the **×** in the corner to clear a slot.

### Step 3 — Pick what to transfer

The **Transfer from Reference** checkboxes control which attributes come from the Reference image. Unchecked attributes stay from the Source.

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

Click **Generate**. You'll see the button label change to **Analyzing images…** while the vision call runs, then the assembled prompt appears in the read-only main textarea AND in the **Assembled prompt preview** at the bottom of the orchestrator panel. The actual image generation starts immediately after.

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

**"Could not save orchestrator state — uploaded images may be too large"** — base64-encoded images can exceed `localStorage`'s ~5MB quota. Your Source/Reference images won't persist across refreshes, but the current session still works fine. Use smaller images, or accept the loss.

**Research button stays disabled** — type at least a few characters into the Subject Context field. The button enables once the field is non-empty.

**The assembled prompt doesn't match my toggles** — the assembled prompt only refreshes when you click Generate (since assembling requires a vision call). Click Generate to see the latest prompt in the preview.

## 🔒 Privacy & Security

This is a **100% client-side application**:

- ✅ API keys are stored in YOUR browser only
- ✅ Generated images are stored in YOUR browser only (IndexedDB)
- ✅ No data is sent to any server except OpenRouter API
- ✅ Safe to deploy as a static website

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Enter` | Generate images |
| `Escape` | Close image modal |

## 🛠️ Tech Stack

- **Frontend**: Pure HTML/CSS/JavaScript (no dependencies)
- **API**: OpenRouter for model access
- **Storage**: IndexedDB for image persistence
- **Styling**: Custom CSS with CSS variables

## 📁 Project Structure

```
lazy-imagen-openrouter/
├── src/            # Source code (app.js, styles.css)
├── assets/         # Screenshots
├── index.html      # Main entry point
├── favicon.svg
└── README.md       # This file — full user guide
```

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
