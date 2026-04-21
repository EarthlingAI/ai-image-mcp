import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// --- Types ---

export type Provider = "gemini" | "openai" | "replicate";
export type Quality = "low" | "medium" | "high";
export type Size = "square" | "landscape" | "portrait";
export type Format = "png" | "jpeg" | "webp";

// --- Local (non-AI) background removal ---

export type RembgModel =
	| "isnet-general-use"
	| "u2net"
	| "u2netp"
	| "silueta"
	| "birefnet-general";

export type AlphaFormat = "png" | "webp";

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

export interface RemoveBgParams {
	imagePath: string;
	model: RembgModel;
	alphaMatting: boolean;
	format: AlphaFormat;
	fgThreshold: number;
	bgThreshold: number;
	erodeSize: number;
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
	return path.resolve(process.env.OUTPUT_DIR || "outputs/images");
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

// --- Local Python sidecar resolution ---

export function resolveMcpRoot(): string {
	let dir = path.dirname(fileURLToPath(import.meta.url));
	while (!fs.existsSync(path.join(dir, "package.json"))) {
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error("Could not locate ai-image-mcp root (no package.json found walking upward).");
		}
		dir = parent;
	}
	return dir;
}

export function resolvePythonBin(): string {
	const root = resolveMcpRoot();
	const py = process.platform === "win32"
		? path.join(root, ".venv", "Scripts", "python.exe")
		: path.join(root, ".venv", "bin", "python");
	if (!fs.existsSync(py)) {
		throw new Error(
			`ai-image-mcp Python sidecar not found at ${py}. ` +
			"Run `python setup/setup_deps.py` from the project root to provision it.",
		);
	}
	return py;
}

export function resolveRemoveBgScript(): string {
	const script = path.join(resolveMcpRoot(), "python", "remove_bg.py");
	if (!fs.existsSync(script)) {
		throw new Error(`remove_bg.py not found at ${script}. Reinstall via setup/setup_deps.py.`);
	}
	return script;
}
