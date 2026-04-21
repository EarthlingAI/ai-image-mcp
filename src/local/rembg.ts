import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { RemoveBgParams, ImageResult } from "../utils.js";
import {
	mimeTypeForFormat,
	resolveOutputDir,
	resolvePythonBin,
	resolveRemoveBgScript,
	sanitizeFilename,
} from "../utils.js";

export async function removeBackground(params: RemoveBgParams): Promise<ImageResult> {
	const python = resolvePythonBin();
	const script = resolveRemoveBgScript();

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
		script,
		"--input", src,
		"--output", outPath,
		"--model", params.model,
		"--format", params.format,
		params.alphaMatting ? "--alpha-matting" : "--no-alpha-matting",
		"--fg-threshold", String(params.fgThreshold),
		"--bg-threshold", String(params.bgThreshold),
		"--erode-size", String(params.erodeSize),
	];

	await runPython(python, args);

	if (!fs.existsSync(outPath)) {
		throw new Error("remove_bg.py exited successfully but produced no output file.");
	}

	const buffer = fs.readFileSync(outPath);
	return {
		base64: buffer.toString("base64"),
		mimeType: mimeTypeForFormat(params.format),
		filePath: outPath,
	};
}

function runPython(python: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(python, args, { windowsHide: true });
		let stderr = "";
		child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
		child.on("error", (err) => {
			reject(new Error(`Failed to spawn Python (${python}): ${err.message}`));
		});
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`remove_bg.py exited with code ${code}. ${stderr.trim() || "(no stderr)"}`));
		});
	});
}
