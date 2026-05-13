# Model Reference

Long-form reference for every model the app ships with. The same information surfaces in-app via the Model Info card under each dropdown.

> Live pricing is fetched from OpenRouter's `/api/v1/models` endpoint at runtime and cached for 24h. The "approx pricing" column below is indicative — always trust the live values shown in the UI or [the OpenRouter pricing page](https://openrouter.ai/models).

## Generation Models (image output)

These are the models that produce the final image. Selected from the **Model** dropdown in the sidebar.

| Display Name | OpenRouter ID | Best For | Speed | Image Input | Max Refs |
| --- | --- | --- | --- | --- | --- |
| Gemini 2.5 Flash Image | `google/gemini-2.5-flash-image` | Recommended default — fast generation and edits | ⚡ fast | ✓ | 3 |
| Gemini 2.5 Flash Image (Preview) | `google/gemini-2.5-flash-image-preview` | Preview build of Gemini 2.5 Flash Image | ⚡ fast | ✓ | 3 |
| Gemini 3.1 Flash Image (Preview) | `google/gemini-3.1-flash-image-preview` | Newer Flash generation — improved detail and consistency | ⚡ fast | ✓ | 3 |
| Gemini 3 Pro Image (Preview) | `google/gemini-3-pro-image-preview` | Best for complex compositions with many references | ◐ medium | ✓ | 14 |
| GPT-5 Image | `openai/gpt-5-image` | Best for prompt adherence and text rendering | ◐ medium | ✓ | 1 |
| GPT-5 Image Mini | `openai/gpt-5-image-mini` | Cheaper OpenAI option for quick iterations | ⚡ fast | ✓ | 1 |
| Flux 2 Pro | `black-forest-labs/flux.2-pro` | Photorealism and artistic flexibility | ◐ medium | ✗ | 0 |
| Flux 2 Max | `black-forest-labs/flux.2-max` | Highest fidelity Flux output | 🐢 slow | ✗ | 0 |
| Flux 2 Flex | `black-forest-labs/flux.2-flex` | Balanced quality vs cost in the Flux family | ⚡ fast | ✗ | 0 |
| Flux 2 Klein 4B | `black-forest-labs/flux.2-klein-4b` | Cheapest Flux option, fastest turnaround | ⚡ fast | ✗ | 0 |
| Seedream 4.5 | `bytedance-seed/seedream-4.5` | Stylized illustration and anime aesthetics | ◐ medium | ✗ | 0 |
| Riverflow V2 Fast | `sourceful/riverflow-v2-fast-preview` | Quick exploratory generations | ⚡ fast | ✗ | 0 |
| Riverflow V2 Standard | `sourceful/riverflow-v2-standard-preview` | Balanced quality and speed | ◐ medium | ✗ | 0 |
| Riverflow V2 Max | `sourceful/riverflow-v2-max-preview` | Highest quality Riverflow output | 🐢 slow | ✗ | 0 |

**Important:** Orchestrator Mode requires `Image Input ✓`. Flux, Seedream, and Riverflow are text-to-image only and will not work in that mode.

## Vision Analyst Models

Used in Orchestrator Mode to read Source + Reference and produce a structured JSON description. Selected from the **Vision Analyst Model** dropdown inside the orchestrator panel.

| Display Name | OpenRouter ID | Best For | Speed | Context |
| --- | --- | --- | --- | --- |
| Gemini 2.5 Flash | `google/gemini-2.5-flash` | Recommended — fast, cheap, accurate JSON | ⚡ fast | 1M tokens |
| Gemini 2.0 Flash | `google/gemini-2.0-flash-001` | Cheapest option | ⚡ fast | 1M tokens |
| Gemini 2.5 Pro | `google/gemini-2.5-pro` | Highest detail extraction, slower | 🐢 slow | 2M tokens |
| GPT-4o Mini | `openai/gpt-4o-mini` | Fast OpenAI option, strong JSON adherence | ⚡ fast | 128K tokens |
| GPT-4o | `openai/gpt-4o` | Best for nuanced scene description | ◐ medium | 128K tokens |
| GPT-4.1 Mini | `openai/gpt-4.1-mini` | Newest small OpenAI vision model | ⚡ fast | 1M tokens |
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | Excellent visual reasoning | ◐ medium | 200K tokens |
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | Best for subtle style + composition | ◐ medium | 200K tokens |
| Qwen2.5-VL 72B | `qwen/qwen2.5-vl-72b-instruct` | Open-weights, strong on anime/art | ◐ medium | 32K tokens |
| Llama 3.2 90B Vision | `meta-llama/llama-3.2-90b-vision-instruct` | Open-weights, general purpose | ◐ medium | 128K tokens |

You can also paste any other OpenRouter vision-capable model ID into the custom override field below the dropdown.

## Research Models

Used by the **Research subject** button inside the Subject Context block. These models can search the web to fetch facts about subjects the image model may not know.

| Display Name | OpenRouter ID | Best For |
| --- | --- | --- |
| Perplexity Sonar | `perplexity/sonar` | Fast web research, cheap |
| Perplexity Sonar Pro | `perplexity/sonar-pro` | Deeper research, more sources |
| Perplexity Sonar Reasoning | `perplexity/sonar-reasoning` | Complex/obscure subjects |

## How model selection affects each call

| User action | Generation Model | Vision Analyst | Research Model |
| --- | --- | --- | --- |
| Manual prompt → Generate | Used (chat-completions) | Not called | Not called |
| Orchestrator → Generate | Used for image step | Used for vision step | Not called |
| Click 🔍 Research button | Not called | Not called | Used |

Each is a separate billable call. Orchestrator Mode therefore makes 2-3 API calls per click depending on whether you used Research first.
