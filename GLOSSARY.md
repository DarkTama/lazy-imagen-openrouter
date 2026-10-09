# Glossary

**Source (Image 1)** — Image of character whose identity must be preserved.

**Reference (Image 2)** — Donor image; supplies only attributes marked for transfer.

**Attribute** — One transferable aspect of image: clothing, pose, background, expression, hair, lighting, palette, accessories, camera.

**Transfer** — Per-attribute choice: take attribute from Reference (CHANGE) or keep from Source (KEEP).

**Vision Analyst** — Model role that describes Source + Reference as structured per-attribute text.

**Vision Analysis** — Output of Vision Analyst: one description per attribute per image, plus character + style descriptions.

**Assembled Prompt** — Final generation prompt built locally from Vision Analysis + Transfer choices. Building it costs no tokens.

**Re-assemble** — Rebuilding Assembled Prompt from existing Vision Analysis after changing toggles, without new Vision Analyst call.

**Garment Description** — Way Vision Analyst describes clothing: garment type, cut, neckline, length, material, color, trim. Describes the clothes, never the body under them.

**Provider** — OpenAI-compatible endpoint plus key. Each role (Generation, Vision Analyst, Research) picks its own Provider.

**NineGuard** — Key-issuing gateway in front of 9router. Users get a NineGuard key, not direct 9router access. Quota counted per request, not per token.

**9router** — Upstream router behind NineGuard that fans out to model backends (`ag/…`, `nano/…`, etc.).
