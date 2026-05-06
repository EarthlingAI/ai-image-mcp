# AI Image MCP

Multi-provider AI image generation and editing via MCP (Model Context Protocol), plus a local (AI-free) background-removal tool backed by `rembg`.

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

> **Use `remove_background` instead for any "remove background" / "make transparent" / "cut out subject" request.** AI providers cannot reliably produce true alpha transparency — they paint a checkerboard pattern as opaque pixels.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | Description of the edit |
| `image_path` | string | required | Absolute path to source image |
| `provider` | `gemini` \| `openai` \| `replicate` | `gemini` | AI provider |
| `quality` | `low` \| `medium` \| `high` | `high` | Rendering quality |
| `size` | `square` \| `landscape` \| `portrait` | — | Output size (omit to preserve source) |
| `format` | `png` \| `jpeg` \| `webp` | `png` | Output format |
| `mask_path` | string | — | Mask image path (OpenAI only, white = edit region) |

### `remove_background`
Remove the background of an image locally via `rembg` — no AI provider, no API key, no network call. Produces a PNG (or WEBP) with **true alpha transparency**, not a painted checkerboard.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `image_path` | string | required | Absolute path to source image |
| `model` | `isnet-general-use` \| `u2net` \| `u2netp` \| `silueta` \| `birefnet-general` | `isnet-general-use` | Segmentation model |
| `alpha_matting` | boolean | `true` | Clean up soft edges (hair, fabric) via alpha matting |
| `format` | `png` \| `webp` | `png` | Alpha-preserving output format |
| `fg_threshold` | int (0–255) | `240` | Alpha-matting foreground threshold |
| `bg_threshold` | int (0–255) | `10` | Alpha-matting background threshold |
| `erode_size` | int (0–50) | `10` | Alpha-matting erode size (px) |

Backed by a Python sidecar (`python/remove_bg.py`) packaged as a separate MCP (`ai-image-mcp-sidecar`). Inside the Earthling system, both halves' source ships embedded in the engine binary; the sidecar runs in an isolated venv provisioned at `<workspace>/data/mcp/ai-image-mcp-sidecar/.venv/` by `engine setup-deps` and is spawned on demand via the engine's `run-mcp` dispatcher.

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

## Architecture

```
src/
├── index.ts              # Tool registration + dispatch (thin)
├── utils.ts              # Types, mapping tables, image I/O, sidecar invocation
├── providers/            # AI providers (network, require API keys)
│   ├── gemini.ts          # generate() + edit()
│   ├── openai.ts          # generate() + edit()
│   └── replicate.ts       # generate() + edit()
└── local/                # Local dispatchers (no network, no API keys)
    └── rembg.ts           # removeBackground() — invokes the Python sidecar

python/
├── remove_bg.py          # rembg entry script — packaged as the `ai-image-mcp-sidecar` MCP
└── requirements.txt      # rembg + onnxruntime + pillow
```

- `index.ts` is a thin dispatcher — tool schemas, parameter validation (Zod), and routing. No business logic.
- `utils.ts` owns all cross-provider concerns — types, mapping tables (`SIZE_MAP`, `QUALITY_MAP`), file I/O, helpers, and the sidecar invocation helper.
- Each AI provider under `providers/` exports `generate()` and `edit()`, both returning `ImageResult`.
- Each local tool under `local/` exports a single function (e.g. `removeBackground()`) that also returns `ImageResult`. Local tools spawn the Python sidecar via the host system's MCP dispatcher (in the Earthling system, `<EARTHLING_ENGINE_EXE> run-mcp ai-image-mcp-sidecar`).
- Everything imports from `utils.ts` only — never from siblings.

## Response Format

Both tools return:

```
content: [
  { type: "text", text: "Image saved to: <absolute_path>\nProvider: <name> | Size: <size> | Quality: <quality>" },
  { type: "image", data: "<base64>", mimeType: "image/<format>" }
]
```

The text block gives the agent the file path for follow-up operations (editing, embedding, referencing). The image block gives the agent visual confirmation inline.

On error: `{ content: [{ type: "text", text: "Error: <message>\nTry an alternative provider: <others>" }], isError: true }`.

## License

MIT — EarthlingAI
