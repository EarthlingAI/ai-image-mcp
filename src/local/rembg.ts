import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { RemoveBgParams, ImageResult } from "../utils.js";
import {
	mimeTypeForFormat,
	resolveOutputDir,
	sanitizeFilename,
} from "../utils.js";

export async function removeBackground(params: RemoveBgParams): Promise<ImageResult> {
	const enginePath = process.env.EARTHLING_ENGINE_EXE;
	if (!enginePath) {
		throw new Error("EARTHLING_ENGINE_EXE not set — ai-image-mcp must be launched via `engine.exe run-mcp ai-image-mcp`.");
	}

	const src = path.resolve(params.imagePath);
	if (!fs.existsSync(src)) {
		throw new Error(`File not found: ${params.imagePath}. Provide a valid image path.`);
	}

	const outDir = resolveOutputDir();
	fs.mkdirSync(outDir, { recursive: true });

	const hint = sanitizeFilename(path.parse(src).name);
	const id = crypto.randomBytes(4).toString("hex");
	const outPath = path.resolve(outDir, `${Date.now()}-${id}-${hint}-nobg.${params.format}`);

	const args = [
		"run-mcp", "ai-image-mcp-sidecar",
		"--input", src,
		"--output", outPath,
		"--model", params.model,
		"--format", params.format,
		params.alphaMatting ? "--alpha-matting" : "--no-alpha-matting",
		"--fg-threshold", String(params.fgThreshold),
		"--bg-threshold", String(params.bgThreshold),
		"--erode-size", String(params.erodeSize),
	];

	await runEngine(enginePath, args);

	if (!fs.existsSync(outPath)) {
		throw new Error("ai-image-mcp-sidecar exited successfully but produced no output file.");
	}

	const buffer = fs.readFileSync(outPath);
	return {
		base64: buffer.toString("base64"),
		mimeType: mimeTypeForFormat(params.format),
		filePath: outPath,
	};
}

function runEngine(enginePath: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(enginePath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
		let stderr = "";
		child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
		child.on("error", (err) => {
			reject(new Error(`Failed to spawn engine (${enginePath}): ${err.message}`));
		});
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ai-image-mcp-sidecar exited with code ${code}. ${stderr.trim() || "(no stderr)"}`));
		});
	});
}
