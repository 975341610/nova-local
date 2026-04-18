"""Generate simple animated GIF emoticons for local testing.

Usage:
  python3 nova_repo/scripts/generate_test_emoticons.py

Outputs:
  nova_repo/data/emoticons/*.gif
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "emoticons"


def _save_gif(frames: list[Image.Image], path: Path, duration_ms: int = 120) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        optimize=False,
        disposal=2,
    )


def gen_color_blink() -> None:
    size = (96, 96)
    colors = [(255, 87, 87), (87, 189, 255), (129, 255, 148), (255, 221, 87)]
    frames: list[Image.Image] = []
    for i in range(16):
        img = Image.new("RGBA", size, colors[i % len(colors)] + (255,))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([8, 8, 88, 88], radius=18, outline=(255, 255, 255, 220), width=6)
        frames.append(img)

    _save_gif(frames, OUT_DIR / "test_color_blink.gif", duration_ms=100)


def gen_bouncing_square() -> None:
    size = (96, 96)
    frames: list[Image.Image] = []
    steps = list(range(10)) + list(range(10, 0, -1))
    for t in steps:
        img = Image.new("RGBA", size, (20, 20, 20, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, 95, 95], radius=22, fill=(30, 30, 30, 230))
        x = 12 + t * 6
        y = 52 - t * 3
        d.rounded_rectangle([x, y, x + 24, y + 24], radius=6, fill=(255, 255, 255, 235))
        frames.append(img)

    _save_gif(frames, OUT_DIR / "test_bounce.gif", duration_ms=70)


def gen_text_flash() -> None:
    size = (120, 72)
    frames: list[Image.Image] = []

    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 28)
    except Exception:
        font = ImageFont.load_default()

    for i in range(18):
        on = i % 2 == 0
        bg = (255, 255, 255, 255) if on else (255, 255, 255, 0)
        fg = (25, 25, 25, 255) if on else (25, 25, 25, 80)

        img = Image.new("RGBA", size, bg)
        d = ImageDraw.Draw(img)
        text = "Nova!"
        bbox = d.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        d.text(((size[0] - w) / 2, (size[1] - h) / 2 - 2), text, font=font, fill=fg)
        frames.append(img)

    _save_gif(frames, OUT_DIR / "test_text_flash.gif", duration_ms=110)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    gen_color_blink()
    gen_bouncing_square()
    gen_text_flash()

    print("Generated:")
    for p in sorted(OUT_DIR.glob("test_*.gif")):
        print("-", p.relative_to(ROOT))


if __name__ == "__main__":
    main()
