# User Guide

Welcome to **lazy-imagen-openrouter**. This guide walks you through both the standard manual flow and the new **Orchestrator Mode** (no-typing image-to-image).

## 1. Quick start

1. Open `index.html` in a browser (or run a local static server: `python -m http.server 8000`).
2. Paste your OpenRouter API key into the **OpenRouter API Key** field in the sidebar, then click **Save Key**. The key is stored only in your browser's `localStorage` — it never leaves your machine except in API requests to OpenRouter.
3. Pick a **Model** from the dropdown. The info card below shows what each model is best for, its speed, and (once pricing loads) its cost per million tokens / per image.
4. Type a prompt in the main textarea and click **Generate**.

That's the manual flow. The rest of this guide covers Orchestrator Mode.

## 2. Orchestrator Mode — overview

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

## 3. Walkthrough

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

## 4. Reading the Model Info card

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

## 5. Troubleshooting

**"Vision analysis failed: …"** — the vision model couldn't process your images or returned malformed JSON. Common causes:
- Your API key has no credit for the chosen vision model.
- The custom model ID you pasted doesn't exist or doesn't support vision.
- The chosen model is rate-limited.
The orchestrator falls back to whatever's in the textarea, so a previous assembled prompt may still generate something usable.

**"Doesn't support image input"** — Orchestrator Mode requires a generation model that accepts reference images. Switch to a Gemini, GPT-5 Image, or other vision-capable model. Flux, Seedream, and Riverflow are text-to-image only.

**"Could not save orchestrator state — uploaded images may be too large"** — base64-encoded images can exceed `localStorage`'s ~5MB quota. Your Source/Reference images won't persist across refreshes, but the current session still works fine. Use smaller images, or accept the loss.

**Research button stays disabled** — type at least a few characters into the Subject Context field. The button enables once the field is non-empty.

**The assembled prompt doesn't match my toggles** — the assembled prompt only refreshes when you click Generate (since assembling requires a vision call). Click Generate to see the latest prompt in the preview.

## 6. Keyboard shortcuts

- **Ctrl + Enter** — Generate
- **Escape** — Close the image modal
