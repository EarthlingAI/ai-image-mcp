import * as fs from "node:fs";
import * as path from "node:path";

// --- Types ---

export type Provider = "gemini" | "openai" | "replicate";
export type Quality = "low" | "medium" | "high";
export type Size = "square" | "landscape" | "portrait";
export type Format = "png" | "jpeg" | "webp";

export interface GenerateParams {
	prompt: string;
	quality: Quality;
	size: Size;
	format: Format;
	background?: "transparent" | "opaque";
}

export interface EditParams {
	prompt: string;
	imagePath: string;
	quality: Quality;
	size?: Size;
	format: Format;
	maskPath?: string;
}

export interface ImageResult {
	base64: string;
	mimeType: string;
	filePath: string;
}

// --- Mapping Tables ---

export const SIZE_MAP = {
	openai: { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" },
	gemini: { square: "1:1", landscape: "16:9", portrait: "9:16" },
	replicate: { square: "1:1", landscape: "16:9", portrait: "9:16" },
} as const;

export const QUALITY_MAP = {
	openai: { low: "low", medium: "medium", high: "high" },
	replicate: { low: 60, medium: 80, high: 95 },
} as const;

// --- Utilities ---

export function mimeTypeForFormat(format: Format): string {
	if (format === "png") return "image/png";
	if (format === "jpeg") return "image/jpeg";
	return "image/webp";
}

export function sanitizeFilename(hint?: string): string {
	if (!hint) return "image";
	return hint
		.toLowerCase()
		.replace(/[^a-z0-9\-_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		|| "image";
}

export function resolveOutputDir(): string {
	return path.resolve(process.env.OUTPUT_DIR || "outputs");
}

export function saveImage(base64: string, format: Format, hint?: string): string {
	const dir = resolveOutputDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const ext = format === "jpeg" ? "jpg" : format;
	const filename = `${Date.now()}-${sanitizeFilename(hint)}.${ext}`;
	const filePath = path.resolve(dir, filename);
	fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
	return filePath;
}

export function readImageToBase64(filePath: string): { base64: string; mimeType: string } {
	const resolved = path.resolve(filePath);
	if (!fs.existsSync(resolved)) {
		throw new Error(`File not found: ${filePath}. Provide a valid image path.`);
	}
	const buffer = fs.readFileSync(resolved);
	const ext = path.extname(resolved).toLowerCase().replace(".", "");
	const mimeType = ext === "jpg" || ext === "jpeg"
		? "image/jpeg"
		: ext === "webp"
			? "image/webp"
			: "image/png";
	return { base64: buffer.toString("base64"), mimeType };
}
