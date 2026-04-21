#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Provider, GenerateParams, EditParams, RemoveBgParams } from "./utils.js";
import * as gemini from "./providers/gemini.js";
import * as openai from "./providers/openai.js";
import * as replicate from "./providers/replicate.js";
import * as rembgLocal from "./local/rembg.js";

const providers = { gemini, openai, replicate } as const;

const server = new McpServer({
	name: "ai-image-mcp",
	version: "1.1.0",
});

// --- generate_image ---

server.tool(
	"generate_image",
	"Generate an image from a text prompt. Saves to disk and returns the image inline.",
	{
		prompt: z.string().min(1).describe("Text description of the image to generate"),
		provider: z.enum(["gemini", "openai", "replicate"]).default("gemini")
			.describe("AI provider. gemini: fast, good editing. openai: best text rendering, mask-based inpainting. replicate: strong photorealism"),
		quality: z.enum(["low", "medium", "high"]).default("high")
			.describe("Rendering quality. Higher = slower and more expensive"),
		size: z.enum(["square", "landscape", "portrait"]).default("square")
			.describe("Image dimensions"),
		format: z.enum(["png", "jpeg", "webp"]).default("png")
			.describe("Output file format"),
		background: z.enum(["transparent", "opaque"]).optional()
			.describe("Background style. Only supported by OpenAI. Requires png or webp format"),
	},
	async (params) => {
		const provider = params.provider as Provider;
		const genParams: GenerateParams = {
			prompt: params.prompt,
			quality: params.quality as GenerateParams["quality"],
			size: params.size as GenerateParams["size"],
			format: params.format as GenerateParams["format"],
			background: params.background as GenerateParams["background"],
		};
		try {
			const result = await providers[provider].generate(genParams);
			return {
				content: [
					{
						type: "text" as const,
						text: `Image saved to: ${result.filePath}\nProvider: ${provider} | Size: ${params.size} | Quality: ${params.quality}`,
					},
					{
						type: "image" as const,
						data: result.base64,
						mimeType: result.mimeType,
					},
				],
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			const alternatives = (["gemini", "openai", "replicate"] as const).filter(p => p !== provider);
			return {
				content: [{
					type: "text" as const,
					text: `Error: ${msg}\nTry an alternative provider: ${alternatives.join(", ")}`,
				}],
				isError: true,
			};
		}
	},
);

// --- edit_image ---

server.tool(
	"edit_image",
	"Edit an existing image using a text prompt. Reads the source image from disk, applies the edit, and saves the result. For background removal or making an image transparent, use `remove_background` instead — AI providers cannot reliably produce true alpha transparency.",
	{
		prompt: z.string().min(1).describe("Text description of the edit to apply"),
		image_path: z.string().min(1).describe("Absolute path to the source image file"),
		provider: z.enum(["gemini", "openai", "replicate"]).default("gemini")
			.describe("AI provider. Default: gemini. Use openai for mask-based inpainting"),
		quality: z.enum(["low", "medium", "high"]).default("high")
			.describe("Rendering quality"),
		size: z.enum(["square", "landscape", "portrait"]).optional()
			.describe("Output size. If omitted, provider decides based on source image"),
		format: z.enum(["png", "jpeg", "webp"]).default("png")
			.describe("Output file format"),
		mask_path: z.string().optional()
			.describe("Path to mask image (white = edit region). Only supported by OpenAI"),
	},
	async (params) => {
		const provider = params.provider as Provider;
		const editParams: EditParams = {
			prompt: params.prompt,
			imagePath: params.image_path,
			quality: params.quality as EditParams["quality"],
			size: params.size as EditParams["size"],
			format: params.format as EditParams["format"],
			maskPath: params.mask_path,
		};
		try {
			const result = await providers[provider].edit(editParams);
			return {
				content: [
					{
						type: "text" as const,
						text: `Edited image saved to: ${result.filePath}\nProvider: ${provider} | Quality: ${params.quality}`,
					},
					{
						type: "image" as const,
						data: result.base64,
						mimeType: result.mimeType,
					},
				],
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			const alternatives = (["gemini", "openai", "replicate"] as const).filter(p => p !== provider);
			return {
				content: [{
					type: "text" as const,
					text: `Error: ${msg}\nTry an alternative provider: ${alternatives.join(", ")}`,
				}],
				isError: true,
			};
		}
	},
);

// --- remove_background ---

server.tool(
	"remove_background",
	"Remove the background of an image locally via rembg (no AI provider). Produces a PNG/WEBP with TRUE alpha transparency — not a painted checkerboard. Use this for any 'remove background', 'make transparent', 'cut out subject', or 'isolate foreground' request. Runs entirely offline via a bundled Python sidecar, so no API key is required and no network call is made.",
	{
		image_path: z.string().min(1)
			.describe("Absolute path to the source image file"),
		model: z.enum(["isnet-general-use", "u2net", "u2netp", "silueta", "birefnet-general"])
			.default("isnet-general-use")
			.describe("Segmentation model. Default `isnet-general-use` is best for portraits and general subjects. `u2netp` is lighter/faster; `birefnet-general` is a newer heavier alternative"),
		alpha_matting: z.boolean().default(true)
			.describe("Clean up soft edges (hair, fur, fabric) via alpha matting. Default on — turn off for speed on clean hard-edged subjects"),
		format: z.enum(["png", "webp"]).default("png")
			.describe("Output format. Both preserve alpha; jpeg is intentionally not offered because it can't carry transparency"),
		fg_threshold: z.number().int().min(0).max(255).default(240)
			.describe("Alpha-matting foreground threshold (0-255). Only used when alpha_matting=true"),
		bg_threshold: z.number().int().min(0).max(255).default(10)
			.describe("Alpha-matting background threshold (0-255). Only used when alpha_matting=true"),
		erode_size: z.number().int().min(0).max(50).default(10)
			.describe("Alpha-matting erode size in pixels. Only used when alpha_matting=true"),
	},
	async (params) => {
		const bgParams: RemoveBgParams = {
			imagePath: params.image_path,
			model: params.model,
			alphaMatting: params.alpha_matting,
			format: params.format,
			fgThreshold: params.fg_threshold,
			bgThreshold: params.bg_threshold,
			erodeSize: params.erode_size,
		};
		try {
			const result = await rembgLocal.removeBackground(bgParams);
			return {
				content: [
					{
						type: "text" as const,
						text: `Background removed and saved to: ${result.filePath}\nEngine: rembg (local, no AI) | Model: ${params.model} | Alpha matting: ${params.alpha_matting}`,
					},
					{
						type: "image" as const,
						data: result.base64,
						mimeType: result.mimeType,
					},
				],
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			return {
				content: [{
					type: "text" as const,
					text: `Error: ${msg}`,
				}],
				isError: true,
			};
		}
	},
);

// --- Start ---

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("ai-image-mcp running via stdio");
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
