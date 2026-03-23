import Replicate from "replicate";
import type { GenerateParams, EditParams, ImageResult } from "../utils.js";
import { SIZE_MAP, QUALITY_MAP, saveImage, mimeTypeForFormat, readImageToBase64 } from "../utils.js";

const GENERATE_MODEL = "black-forest-labs/flux-1.1-pro" as const;
const EDIT_MODEL = "black-forest-labs/flux-kontext-pro" as const;

function getClient(): Replicate {
	const token = process.env.REPLICATE_API_TOKEN;
	if (!token) throw new Error("REPLICATE_API_TOKEN not set. Add it to .env");
	return new Replicate({ auth: token });
}

async function outputToBase64(output: unknown): Promise<string> {
	// Replicate returns ReadableStream, URL string, or array of URLs
	if (output instanceof ReadableStream) {
		const reader = output.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		const buf = Buffer.concat(chunks);
		return buf.toString("base64");
	}
	// Array of URLs or single URL
	const url = Array.isArray(output) ? output[0] : output;
	if (typeof url === "string" && url.startsWith("http")) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to download image from Replicate: ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		return buf.toString("base64");
	}
	throw new Error("Unexpected Replicate output format");
}

export async function generate(params: GenerateParams): Promise<ImageResult> {
	const client = getClient();
	const format = params.format === "jpeg" ? "jpg" : params.format;
	const output = await client.run(GENERATE_MODEL, {
		input: {
			prompt: params.prompt,
			aspect_ratio: SIZE_MAP.replicate[params.size],
			output_format: format,
			output_quality: QUALITY_MAP.replicate[params.quality],
		},
	});
	const base64 = await outputToBase64(output);
	const filePath = saveImage(base64, params.format, params.prompt.slice(0, 40));
	return { base64, mimeType: mimeTypeForFormat(params.format), filePath };
}

export async function edit(params: EditParams): Promise<ImageResult> {
	const client = getClient();
	const source = readImageToBase64(params.imagePath);
	const dataUri = `data:${source.mimeType};base64,${source.base64}`;
	const format = params.format === "jpeg" ? "jpg" : params.format;
	const input: Record<string, unknown> = {
		prompt: params.prompt,
		input_image: dataUri,
		output_format: format,
	};
	if (params.size) {
		input.aspect_ratio = SIZE_MAP.replicate[params.size];
	}
	const output = await client.run(EDIT_MODEL, { input });
	const base64 = await outputToBase64(output);
	const filePath = saveImage(base64, params.format, params.prompt.slice(0, 40));
	return { base64, mimeType: mimeTypeForFormat(params.format), filePath };
}
