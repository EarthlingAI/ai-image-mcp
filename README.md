# AI Image MCP

Multi-provider AI image generation and editing via MCP (Model Context Protocol).

## Tools

### `generate_image`
Generate an image from a text prompt. Saves to disk and returns the image inline.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | Text description of the image |
| `provider` | `gemini` \| `openai` \| `replicate` | `gemini` | AI provider |
| `quality` | `low` \| `medium` \| `high` | `high` | Rendering quality |
| `size` | `square` \| `landscape` \| `portrait` | `square` | Image dimensions |
| `format` | `png` \| `jpeg` \| `webp` | `png` | Output format |
| `background` | `transparent` \| `opaque` | — | Background style (OpenAI only) |

### `edit_image`
Edit an existing image using a text prompt. Reads from disk, applies the edit, saves the result.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | Description of the edit |
| `image_path` | string | required | Absolute path to source image |
| `provider` | `gemini` \| `openai` \| `replicate` | `gemini` | AI provider |
| `quality` | `low` \| `medium` \| `high` | `high` | Rendering quality |
| `size` | `square` \| `landscape` \| `portrait` | — | Output size (omit to preserve source) |
| `format` | `png` \| `jpeg` \| `webp` | `png` | Output format |
| `mask_path` | string | — | Mask image path (OpenAI only, white = edit region) |

## Providers

| Provider | Generate | Edit | API Key |
|----------|----------|------|---------|
| **Gemini** (default) | `gemini-2.5-flash-image` | Same model (multimodal) | `GOOGLE_API_KEY` |
| **OpenAI** | `gpt-image-1` | `gpt-image-1` (with mask support) | `OPENAI_API_KEY` |
| **Replicate** | `flux-1.1-pro` | `flux-kontext-pro` | `REPLICATE_API_TOKEN` |

## Setup

```bash
npm install
npm run build
```

Pass API keys as environment variables. At least one provider key is required.

## License

MIT — EarthlingAI
