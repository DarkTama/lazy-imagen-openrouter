> **Historical context:** This document is the original design spec produced by Gemini that seeded the Orchestrator Mode feature. It is kept verbatim for reference. The actual implementation extends it with a customizable Vision Analyst, an expanded toggle palette (Facial Expression, Hair, Lighting, Color Palette, Accessories, Camera Framing, Identity Lock, Creativity), live model metadata (best-for, pricing, speed), and a Subject Context field with optional Perplexity Sonar research. See [ARCHITECTURE.md](ARCHITECTURE.md) for the as-built design and [USER_GUIDE.md](USER_GUIDE.md) for end-user docs.

---

# Technical Specification: lazy-imagen-openrouter Prompt Orchestrator

## 1. Project Overview
**Goal:** Modify the `yusufipk/imagen-openrouter` frontend to enable a "No-Typing" reimagining workflow. The tool will allow a user to upload a **Source Image** (Character) and a **Reference Image** (Style/Pose/Clothes) and use checkboxes to determine which attributes are transferred.

**Core Tech Stack:**
* **Frontend:** Vanilla JS / HTML / CSS (Existing base).
* **Generation Model:** `black-forest-labs/flux-1.1-pro` or `flux-2-pro`.
* **Vision Analyst:** `google/gemini-2.0-flash-001` (via OpenRouter) for metadata extraction.

---

## 2. UI / Functional Requirements
Inject a "Transformation Control Panel" into the existing UI with the following components:

### A. Toggle Controls
| Feature | Logic |
| :--- | :--- |
| **Character** | Always preserved from Source Image. |
| **Clothing** | [Checkbox] If checked, use Reference; else use Source. |
| **Pose/Body** | [Checkbox] If checked, use Reference; else use Source. |
| **Background** | [Checkbox] If checked, use Reference; else use Source. |
| **Art Style** | [Radio Toggle] Choice between Source Style or Reference Style. |

---

## 3. Execution Pipeline (The Chained Request)
When the "Generate" button is clicked, the app must perform these steps automatically:

### Phase 1: Metadata Extraction (Vision Call)
The app sends a hidden request to a fast vision model (`gemini-2.0-flash-001`) with both images attached.
**System Prompt:**
> "Analyze Image 1 (Source) and Image 2 (Reference). Provide a JSON response describing the character's physical features in Image 1, and the clothes, pose, and background details for both. Use keys: source_char, source_clothes, source_pose, source_bg, ref_clothes, ref_pose, ref_bg, source_style, ref_style."

### Phase 2: Prompt Orchestration
A JavaScript function merges the Vision JSON with the Checkbox states to build the `finalPrompt`.

**Composition Logic:**
1. **Style:** Reference the chosen radio button style.
2. **Character:** Use `source_char` as the anchor.
3. **Attributes:** Dynamically inject `ref_` or `source_` strings based on checkbox booleans.
4. **Instruction:** Append a hardcoded directive to maintain 100% facial consistency with Image 1.

### Phase 3: Final Generation
The app sends the `finalPrompt` + both images to the Flux model on OpenRouter.

---

## 4. Implementation Tasks for AI Agent

### Task 1: UI Injection
* Modify `index.html` to add the Control Panel div.
* Ensure the styling matches the existing dark-mode CSS.

### Task 2: State Management
* Update the JavaScript to listen for checkbox/radio changes and store them in a `userPreferences` object.

### Task 3: API Interception
* Modify the `generate()` function in the base code.
* **Pre-hook:** Call the Vision API first to get descriptions.
* **Main Call:** Use the assembled prompt instead of the `textarea` input.

### Task 4: Feedback Loop
* Populate the (now hidden) text prompt area with the assembled prompt string so the user can verify the logic in the console or a "debug" view.

### Task 5: Documentation Update (GPL-3.0 Compliance)
* Modify the project's `README.md` to establish this as a fork and ensure license compliance. Inject the following block directly beneath the main title/header:

> ## 📖 Origin & Credits
> This project is a modified fork of the excellent [imagen-openrouter](https://github.com/yusufipk/imagen-openrouter) by yusufipk.
>
> **lazy-imagen-openrouter:** > The lazy developer's UI for OpenRouter. Upload two images, click a few checkboxes, and let the tool write the complex image-to-image prompts for you. It chains a vision model to automatically extract metadata from a Source and Reference image, allowing users to effortlessly transfer poses, clothing, and styles.
>
> As per the original project, this modified software remains open-source and is licensed under the **GPL-3.0 License**.

---

## 5. Security & Configuration
* **Storage:** Continue using `localStorage` for the OpenRouter API Key.
* **Error Handling:** If the Vision call fails, fall back to the manual text prompt input.
