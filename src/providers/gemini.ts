import { GoogleGenAI } from "@google/genai";
import type { GenerateParams, EditParams, ImageResult } from "../utils.js";
import { SIZE_MAP, saveImage, mimeTypeForFormat, readImageToBase64 } from "../utils.js";

const MODEL = "gemini-2.5-flash-image";

function getClient(): GoogleGenAI {
	const key = process.env.GOOGLE_API_KEY;
	if (!key) throw new Error("GOOGLE_API_KEY not set. Add it to .env");
	return new GoogleGenAI({ apiKey: key });
}

function extractImage(response: any): { base64: string; mimeType: string } {
	const candidates = response?.candidates ?? [];
	for (const candidate of candidates) {
		for (const part of candidate?.content?.parts ?? []) {
			if (part?.inlineData?.data) {
				return {
					base64: part.inlineData.data,
					mimeType: part.inlineData.mimeType || "image/png",
				};
			}
		}
	}
	// Surface text response for debugging if no image found
	const textParts = candidates
		.flatMap((c: any) => c?.content?.parts ?? [])
		.filter((p: any) => p?.text)
		.map((p: any) => p.text);
	const hint = textParts.length ? ` Model responded with text: "${textParts.join(" ")}"` : "";
	throw new Error(`Gemini returned no image data.${hint}`);
}

export async function generate(params: GenerateParams): Promise<ImageResult> {
	const ai = getClient();
	const response = await ai.models.generateContent({
		model: MODEL,
		contents: [{ text: params.prompt }],
		config: {
			responseModalities: ["TEXT", "IMAGE"],
			imageConfig: {
				aspectRatio: SIZE_MAP.gemini[params.size] as any,
			},
		},
	});
	const { base64, mimeType } = extractImage(response);
	const filePath = saveImage(base64, params.format, params.prompt.slice(0, 40));
	return { base64, mimeType: mimeTypeForFormat(params.format), filePath };
}

export async function edit(params: EditParams): Promise<ImageResult> {
	const ai = getClient();
	const source = readImageToBase64(params.imagePath);
	const contents: any[] = [
		{ text: params.prompt },
		{ inlineData: { mimeType: source.mimeType, data: source.base64 } },
	];
	const config: any = {
		responseModalities: ["TEXT", "IMAGE"],
	};
	if (params.size) {
		config.imageConfig = { aspectRatio: SIZE_MAP.gemini[params.size] };
	}
	const response = await ai.models.generateContent({
		model: MODEL,
		contents,
		config,
	});
	const { base64, mimeType } = extractImage(response);
	const filePath = saveImage(base64, params.format, params.prompt.slice(0, 40));
	return { base64, mimeType: mimeTypeForFormat(params.format), filePath };
}
