import OpenAI, { toFile } from "openai";
import * as fs from "node:fs";
import type { GenerateParams, EditParams, ImageResult } from "../utils.js";
import { SIZE_MAP, QUALITY_MAP, saveImage, mimeTypeForFormat, readImageToBase64 } from "../utils.js";

const MODEL = "gpt-image-1";

function getClient(): OpenAI {
	const key = process.env.OPENAI_API_KEY;
	if (!key) throw new Error("OPENAI_API_KEY not set. Add it to .env");
	return new OpenAI({ apiKey: key });
}

export async function generate(params: GenerateParams): Promise<ImageResult> {
	const client = getClient();
	const requestParams: Record<string, unknown> = {
		model: MODEL,
		prompt: params.prompt,
		size: SIZE_MAP.openai[params.size],
		quality: QUALITY_MAP.openai[params.quality],
	};
	if (params.background) {
		requestParams.background = params.background;
	}
	if (params.format !== "png") {
		requestParams.output_format = params.format;
	}
	const response = await client.images.generate(requestParams as any);
	const base64 = response.data?.[0]?.b64_json;
	if (!base64) throw new Error("OpenAI returned no image data");
	const filePath = saveImage(base64, params.format, params.prompt.slice(0, 40));
	return { base64, mimeType: mimeTypeForFormat(params.format), filePath };
}

export async function edit(params: EditParams): Promise<ImageResult> {
	const client = getClient();
	const source = readImageToBase64(params.imagePath);
	const imageFile = await toFile(
		Buffer.from(source.base64, "base64"),
		"input.png",
		{ type: source.mimeType },
	);
	const requestParams: Record<string, unknown> = {
		model: MODEL,
		prompt: params.prompt,
		image: imageFile,
		quality: QUALITY_MAP.openai[params.quality],
	};
	if (params.size) {
		requestParams.size = SIZE_MAP.openai[params.size];
	}
	if (params.format !== "png") {
		requestParams.output_format = params.format;
	}
	// Optional mask for inpainting
	if (params.maskPath) {
		const maskBuf = fs.readFileSync(params.maskPath);
		const maskFile = await toFile(maskBuf, "mask.png", { type: "image/png" });
		requestParams.mask = maskFile;
	}
	const response = await client.images.edit(requestParams as any);
	const base64 = response.data?.[0]?.b64_json;
	if (!base64) throw new Error("OpenAI returned no image data for edit");
	const filePath = saveImage(base64, params.format, params.prompt.slice(0, 40));
	return { base64, mimeType: mimeTypeForFormat(params.format), filePath };
}
