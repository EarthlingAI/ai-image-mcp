# CLAUDE.md (ai-image-mcp)

Multi-provider AI image generation and editing MCP server. See `README.md` for tool parameters and provider details.

## Build & Run

```bash
npm install
npm run build        # tsc → dist/
npm run dev          # tsx watch (development)
node dist/index.js   # stdio transport — stdout is MCP protocol, use console.error for logging
```

## Design Principles

### Agent-First Tool Design

This server is consumed by AI agents, not humans. Every design decision flows from that:

- **Capability differentiation over quality rankings.** Provider descriptions state what each provider is good at ("best text rendering", "strong photorealism"), never which is "best" overall. Agents pick based on task requirements. Quality claims become stale as models evolve — capabilities are more durable.
- **Standardised parameters, provider-native mapping.** Agents think in `"high"` / `"landscape"` / `"png"` — never in `"1024x1536"` or `95`. Mapping tables in `utils.ts` translate to provider-native values. This keeps tool schemas clean and agent-facing parameters stable even when providers change their APIs.
- **Self-explanatory schemas.** Zod `.describe()` strings are the primary documentation agents see. They must be concise, accurate, and sufficient to use the tool without any external instructions. If an agent needs to read a README to use a tool correctly, the schema descriptions have failed.
- **Errors that guide recovery.** Every error message tells the agent what to do next — missing API key errors name the env var, provider failures suggest alternatives, file-not-found errors ask for a valid path.

### Architecture

```
src/
├── index.ts              # Tool registration + dispatch (thin)
├── utils.ts              # Types, mapping tables, image I/O (shared)
└── providers/
    ├── gemini.ts          # generate() + edit()
    ├── openai.ts          # generate() + edit()
    └── replicate.ts       # generate() + edit()
```

- **`index.ts` is a thin dispatcher.** Tool schemas, parameter validation (Zod), and routing to `providers[name].generate/edit()`. No business logic.
- **`utils.ts` owns all cross-provider concerns.** Types, mapping tables (`SIZE_MAP`, `QUALITY_MAP`), file I/O (`saveImage`, `readImageToBase64`), and helpers (`sanitizeFilename`, `mimeTypeForFormat`). If it's used by more than one provider, it lives here.
- **Each provider is one file exporting `generate()` and `edit()`.** Both return `ImageResult`. Provider files import from `utils.ts` only — never from each other.

### Conventions

- **Tabs** for indentation
- **No `dotenv`** — the parent system passes env vars via `.mcp.json` `env` field
- **Lazy API key validation** — keys are checked on first use per provider, not at startup. Missing keys don't prevent other providers from working.
- **`console.error` for all logging** — stdout is the MCP protocol stream
- **`as any` for SDK calls** — provider SDKs have strict types that lag behind their actual APIs. Cast where needed rather than fighting outdated type definitions.

## Adding a New Provider

1. Create `src/providers/{name}.ts` — export `generate(params: GenerateParams)` and `edit(params: EditParams)`, both returning `Promise<ImageResult>`
2. Add provider-specific entries to `SIZE_MAP` and `QUALITY_MAP` in `utils.ts` (if the provider uses different native values)
3. Add the provider name to the `Provider` type union in `utils.ts`
4. Add the import and entry to the `providers` object in `index.ts`
5. Add the provider name to both Zod `.enum()` arrays in `index.ts`
6. Update the `.describe()` string on the `provider` parameter — state the new provider's differentiating capability, not a quality judgement

The tool schemas, dispatch logic, and error handling in `index.ts` require no other changes — new providers plug in via the `providers` map.

## Adding a New Tool

Follow the same pattern as `generate_image` / `edit_image`:

1. Define a params interface in `utils.ts` if it differs from existing ones
2. Add `export async function toolName()` to each provider (or a subset — gate unavailable providers with a clear error)
3. Register via `server.tool()` in `index.ts` with Zod schema + dispatch
4. Return `{ content: [text block, image block] }` — always include the saved file path in the text block and the base64 image inline

## Response Format

Both tools return the same structure:

```
content: [
  { type: "text", text: "Image saved to: <absolute_path>\nProvider: <name> | Size: <size> | Quality: <quality>" },
  { type: "image", data: "<base64>", mimeType: "image/<format>" }
]
```

The text block gives the agent the file path for follow-up operations (editing, embedding, referencing). The image block gives the agent visual confirmation inline.

On error: `{ content: [{ type: "text", text: "Error: <message>\nTry an alternative provider: <others>" }], isError: true }`.
