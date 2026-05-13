# lazy-imagen-openrouter

> The lazy developer's UI for OpenRouter. Upload two images, click a few checkboxes, and let the tool write the complex image-to-image prompts for you. It chains a vision model to automatically extract metadata from a Source and Reference image, allowing users to effortlessly transfer poses, clothing, and styles — all without typing a prose prompt.

## 📖 Origin & Credits

This project is a modified fork of the excellent [imagen-openrouter](https://github.com/yusufipk/imagen-openrouter) by yusufipk.

As per the original project, this modified software remains open-source and is licensed under the **GPL-3.0 License**.

---

New users: jump to the [User Guide](docs/USER_GUIDE.md) for a walkthrough of both the manual prompt flow and Orchestrator Mode. Developers: see [Architecture](docs/ARCHITECTURE.md) and the [Model Reference](docs/MODELS.md).

![Imagen UI](assets/UI.webp)
![Imagen UI-1](assets/UI-1.webp)

## ✨ Features

### 🧩 Orchestrator Mode (new)
- **No-typing image-to-image** — upload a Source image (character) and a Reference image (style/pose/clothes), tick checkboxes for what to transfer, and let a vision model assemble the prompt automatically.
- **9 transfer toggles** — Clothing, Pose/Body, Background, Facial Expression, Hair, Lighting, Color Palette, Accessories, Camera/Framing.
- **3-way Art Style picker** — Source, Reference, or Blend.
- **Identity Lock** — choose how strictly to preserve the Source character's face (Low → Maximum).
- **Creativity slider** — 0–100, dials between "stay faithful" and "allow creative reinterpretation".
- **Customizable Vision Analyst** — 10 curated picks (Gemini Flash/Pro, GPT-4o, Claude Sonnet, Qwen-VL, Llama Vision) plus a free-text custom model ID override.
- **Subject Context with web research** — describe subjects the model doesn't know, or click 🔍 to auto-research via Perplexity Sonar.
- **Read-only prompt preview** — see exactly what was sent to the generation model.

### 📊 Model Info Cards
Every model dropdown now shows pricing (live, from `/api/v1/models`), best-for descriptors, speed indicator, context window, and capability summary.

### 🎨 Multi-Model Support
- **Gemini 2.5 Flash Image** - Google's fast image generation
- **Gemini 2.5 Flash (Preview)** - Preview version with latest features
- **Gemini 3.1 Flash (Preview)** - Newer Gemini preview image model
- **Gemini 3 Pro (Preview)** - Advanced model, up to 14 reference images
- **GPT-5 Image** - OpenAI's latest image model
- **GPT-5 Image Mini** - Faster, smaller GPT-5 variant
- **Flux 2 Pro / Max / Flex / Klein** - Black Forest Labs models
- **Seedream 4.5** - ByteDance's image model
- **Riverflow V2** - Fast/Standard/Max variants

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

1. Clone this repository
2. Start a local server:
   ```bash
   python3 -m http.server 8080
   # or
   npx serve .
   ```
3. Open http://localhost:8080
4. Enter your OpenRouter API key
5. Write a prompt and click Generate!

## 🔑 Getting an OpenRouter API Key

1. Go to [OpenRouter](https://openrouter.ai/)
2. Create an account
3. Navigate to **Keys** section
4. Create a new API key
5. Copy and paste it into the tool

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
├── src/                       # Source code (app.js, styles.css)
├── assets/                    # Screenshots
├── docs/
│   ├── USER_GUIDE.md          # Walkthrough for end users
│   ├── ARCHITECTURE.md        # Developer reference
│   ├── MODELS.md              # Long-form model reference
│   └── ORCHESTRATOR_SPEC.md   # Original Gemini-generated design spec
├── index.html                 # Main entry point
├── favicon.svg
└── README.md
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
