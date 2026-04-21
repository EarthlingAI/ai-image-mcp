"""CLI wrapper for rembg — writes an alpha-transparent PNG or WEBP."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


DEFAULT_MODEL = "isnet-general-use"


def _parse_args(argv: list[str]) -> argparse.Namespace:
	p = argparse.ArgumentParser(prog="remove_bg")
	p.add_argument("--input", required=True)
	p.add_argument("--output", required=True)
	p.add_argument("--model", default=DEFAULT_MODEL)
	p.add_argument("--format", choices=["png", "webp"], default="png")
	p.add_argument("--alpha-matting", dest="alpha_matting", action="store_true", default=True)
	p.add_argument("--no-alpha-matting", dest="alpha_matting", action="store_false")
	p.add_argument("--fg-threshold", type=int, default=240)
	p.add_argument("--bg-threshold", type=int, default=10)
	p.add_argument("--erode-size", type=int, default=10)
	return p.parse_args(argv)


def _fail(msg: str, code: int = 1) -> None:
	print(msg, file=sys.stderr, flush=True)
	sys.exit(code)


def main(argv: list[str] | None = None) -> None:
	args = _parse_args(sys.argv[1:] if argv is None else argv)

	src = Path(args.input)
	dst = Path(args.output)

	if not src.is_file():
		_fail(f"Input not found or not a file: {src}")

	try:
		import numpy as np
		from PIL import Image
		from rembg import new_session, remove
	except ImportError as exc:
		_fail(
			f"ai-image-mcp Python venv is missing a dep ({exc.name}). "
			"Run setup/setup_deps.py to provision it."
		)

	try:
		session = new_session(args.model)
	except Exception as exc:
		_fail(f"Failed to initialise rembg session for model '{args.model}': {exc}")

	try:
		image = Image.open(src).convert("RGBA")
	except Exception as exc:
		_fail(f"Failed to open source image: {exc}")

	try:
		cutout = remove(
			image,
			session=session,
			alpha_matting=args.alpha_matting,
			alpha_matting_foreground_threshold=args.fg_threshold,
			alpha_matting_background_threshold=args.bg_threshold,
			alpha_matting_erode_size=args.erode_size,
		)
	except Exception as exc:
		_fail(f"rembg.remove() failed: {exc}")

	if cutout.mode != "RGBA":
		cutout = cutout.convert("RGBA")

	# Catch a silent rembg regression where the alpha channel is untouched.
	# Uses min<255 (not "any fully transparent pixel") so tightly-cropped
	# subjects that legitimately fill the frame still pass.
	if np.asarray(cutout.split()[-1]).min() == 255:
		_fail("rembg returned a fully opaque image — aborting.")

	try:
		dst.parent.mkdir(parents=True, exist_ok=True)
		if args.format == "webp":
			cutout.save(dst, "WEBP", lossless=True)
		else:
			cutout.save(dst, "PNG")
	except Exception as exc:
		_fail(f"Failed to write output: {exc}")


if __name__ == "__main__":
	main()
