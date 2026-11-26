#!/usr/bin/env python3
"""
ARQENIUM documentation renderer — shared drawing primitives.

Turns declarative "scene" scripts into PNG stills (docs/images) and MP4
screen-capture-style walkthroughs (docs/video).

The renderer draws a faithful mock of the ARQENIUM UI using the same design
tokens as src/renderer/styles/theme.css, so documentation images can be rebuilt
deterministically without a browser:

    python3 docs/tools/build_docs.py

Requires: pillow, imageio-ffmpeg (or a system ffmpeg).
"""
from __future__ import annotations

import math
import os
import shutil
import subprocess
from typing import Callable, Iterable

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, "docs")
IMAGES = os.path.join(DOCS, "images")
VIDEO = os.path.join(DOCS, "video")

# --------------------------------------------------------------------------
# design tokens (mirrors src/renderer/styles/theme.css)
# --------------------------------------------------------------------------
BG = (12, 14, 18)
SURFACE = (18, 21, 27)
SURFACE_2 = (24, 28, 35)
SURFACE_3 = (32, 37, 46)
BORDER = (44, 50, 61)
TEXT = (232, 236, 241)
TEXT_DIM = (154, 164, 178)
TEXT_MUTED = (110, 120, 134)
ACCENT = (53, 200, 216)
ACCENT_SOFT = (24, 74, 82)
OK = (74, 201, 141)
WARN = (232, 179, 74)
ERR = (235, 96, 96)
INFO = (94, 160, 240)
PURPLE = (150, 130, 240)

FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts",
]
_BOLD = ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"]
_REG = ["DejaVuSans.ttf", "LiberationSans-Regular.ttf"]
_MONO_B = ["DejaVuSansMono-Bold.ttf", "LiberationMono-Bold.ttf"]
_MONO = ["DejaVuSansMono.ttf", "LiberationMono-Regular.ttf"]

_FONT_CACHE: dict[tuple[int, str], ImageFont.FreeTypeFont] = {}


def _font(size: int, kind: str = "reg") -> ImageFont.FreeTypeFont:
    key = (size, kind)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    names = {"bold": _BOLD, "mono": _MONO, "mono_b": _MONO_B}.get(kind, _REG)
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                f = ImageFont.truetype(p, size)
                _FONT_CACHE[key] = f
                return f
    f = ImageFont.load_default(size)
    _FONT_CACHE[key] = f
    return f


SIZES = {
    "h1": (30, "bold"),
    "h2": (22, "bold"),
    "h3": (17, "bold"),
    "body": (15, "reg"),
    "body_b": (15, "bold"),
    "sm": (13, "reg"),
    "sm_b": (13, "bold"),
    "xs": (11, "reg"),
    "mono": (13, "mono"),
    "mono_sm": (11, "mono"),
}


def font(name: str) -> ImageFont.FreeTypeFont:
    size, kind = SIZES.get(name, (13, "reg"))
    return _font(size, kind)


# --------------------------------------------------------------------------
# canvas
# --------------------------------------------------------------------------
class Canvas:
    def __init__(self, width: int = 1440, height: int = 860):
        self.w, self.h = width, height
        self.img = Image.new("RGB", (width, height), BG)
        self.d = ImageDraw.Draw(self.img)

    # -- text ------------------------------------------------------------
    def text(self, xy, s, f="body", fill=TEXT, anchor="la"):
        self.d.text(xy, s, font=font(f), fill=fill, anchor=anchor)

    def wrap(self, xy, s, width, f="body", fill=TEXT, lh=None):
        fo = font(f)
        lines: list[str] = []
        for para in s.split("\n"):
            if not para:
                lines.append("")
                continue
            cur = ""
            for word in para.split(" "):
                trial = f"{cur} {word}".strip()
                if self.d.textlength(trial, font=fo) <= width:
                    cur = trial
                else:
                    if cur:
                        lines.append(cur)
                    cur = word
            lines.append(cur)
        lh = lh or int(fo.size * 1.55)
        x, y = xy
        for i, line in enumerate(lines):
            self.d.text((x, y + i * lh), line, font=fo, fill=fill)
        return y + len(lines) * lh

    def measure(self, s, f="sm") -> float:
        return self.d.textlength(s, font=font(f))

    # -- shapes ----------------------------------------------------------
    def rect(self, box, fill=None, outline=None, radius=10, width=1):
        self.d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

    def panel(self, box, fill=SURFACE, outline=BORDER, radius=12):
        self.rect(box, fill=fill, outline=outline, radius=radius)

    def chip(self, xy, label, tone="neutral", f="xs", padx=9, pady=5):
        palette = {
            "ok": (OK, (18, 46, 34)),
            "warn": (WARN, (50, 38, 16)),
            "err": (ERR, (52, 22, 22)),
            "info": (INFO, (18, 34, 56)),
            "accent": (ACCENT, ACCENT_SOFT),
            "neutral": (TEXT_DIM, SURFACE_3),
            "purple": (PURPLE, (36, 31, 60)),
        }
        fg, bg = palette.get(tone, palette["neutral"])
        fo = font(f)
        tw = self.d.textlength(label, font=fo)
        th = fo.size + 6
        x, y = xy
        self.rect((x, y, x + tw + padx * 2, y + th + pady * 2), fill=bg, outline=fg, radius=999)
        self.d.text((x + padx, y + pady + th / 2), label, font=fo, fill=fg, anchor="lm")
        return x + tw + padx * 2

    def dot(self, xy, color=OK, r=4):
        x, y = xy
        self.d.ellipse((x - r, y - r, x + r, y + r), fill=color)

    def bar(self, box, pct, color=OK, track=SURFACE_3, radius=99):
        self.rect(box, fill=track, radius=radius)
        x0, y0, x1, y1 = box
        if pct > 0:
            self.rect((x0, y0, x0 + max(3, (x1 - x0) * min(pct, 1.0)), y1), fill=color, radius=radius)

    def arrow(self, start, end, color=ACCENT, width=2):
        self.d.line([start, end], fill=color, width=width)
        ang = math.atan2(end[1] - start[1], end[0] - start[0])
        L, sp = 11, 0.42
        p1 = (end[0] - L * math.cos(ang - sp), end[1] - L * math.sin(ang - sp))
        p2 = (end[0] - L * math.cos(ang + sp), end[1] - L * math.sin(ang + sp))
        self.d.polygon([end, p1, p2], fill=color)

    def save(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.img.save(path)


# --------------------------------------------------------------------------
# chrome: window frame, sidebar, header, footer
# --------------------------------------------------------------------------
NAV = [
    ("Overview", "overview"),
    ("Runs", "runs"),
    ("Projects", "projects"),
    ("Agents", "agents"),
    ("Integrations", "integrations"),
    ("Evaluation", "evaluation"),
    ("Observability", "observability"),
    ("Terminal", "terminal"),
    ("Rebuild", "rebuild"),
    ("Modules", "modules"),
    ("Settings", "settings"),
]


def window(c: Canvas, title="ARQENIUM"):
    c.rect((0, 0, c.w, c.h), fill=BG, radius=0)
    c.rect((0, 0, c.w, 36), fill=(16, 19, 24))
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        c.dot((22 + i * 18, 18), col, r=5)
    c.text((c.w / 2, 18), title, "sm", TEXT_MUTED, anchor="mm")
    c.d.line([(0, 36), (c.w, 36)], fill=BORDER)


def sidebar(c: Canvas, active="overview", y0=36, height=None):
    w = 232
    height = height or (c.h - y0 - 34)
    c.rect((0, y0, w, y0 + height), fill=SURFACE)
    c.d.line([(w, y0), (w, y0 + height)], fill=BORDER)
    c.rect((18, y0 + 18, 44, y0 + 44), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.d.line([(26, y0 + 36), (36, y0 + 26)], fill=ACCENT, width=2)
    c.d.line([(30, y0 + 22), (38, y0 + 22)], fill=ACCENT, width=2)
    c.text((54, y0 + 23), "ARQENIUM", "h3", TEXT)
    c.text((54, y0 + 43), "engineering command center", "xs", TEXT_MUTED)

    yy = y0 + 76
    for label, key in NAV:
        on = key == active
        if on:
            c.rect((10, yy - 6, w - 10, yy + 26), fill=SURFACE_3, radius=8)
            c.rect((10, yy - 6, 13, yy + 26), fill=ACCENT, radius=3)
        c.text((26, yy + 10), label, "sm_b" if on else "sm", TEXT if on else TEXT_DIM, anchor="lm")
        yy += 34
    return w


def footer(c: Canvas, text="Local API connected · TraceX live"):
    c.rect((0, c.h - 34, c.w, c.h), fill=(16, 19, 24))
    c.d.line([(0, c.h - 34), (c.w, c.h - 34)], fill=BORDER)
    c.dot((20, c.h - 17), OK, 4)
    c.text((32, c.h - 17), text, "xs", TEXT_MUTED, anchor="lm")


def header(c: Canvas, x0, title, subtitle, actions: Iterable[tuple[str, str]] = ()):
    c.text((x0 + 28, 58), title, "h1", TEXT)
    c.text((x0 + 28, 98), subtitle, "sm", TEXT_DIM)
    ax = c.w - 28
    for label, tone in reversed(list(actions)):
        tw = c.measure(label, "sm_b") + 30
        ax -= tw
        c.rect(
            (ax, 60, ax + tw, 90),
            fill=ACCENT_SOFT if tone == "primary" else SURFACE_2,
            outline=ACCENT if tone == "primary" else BORDER,
            radius=8,
        )
        c.text((ax + tw / 2, 75), label, "sm_b", ACCENT if tone == "primary" else TEXT_DIM, anchor="mm")
        ax -= 10
    return 116


def callout(c: Canvas, box, n, text, tone=ACCENT, pos="right"):
    """Highlight a region and number it, like a documentation annotation."""
    x0, y0, x1, y1 = box
    c.rect(box, outline=tone, width=3, radius=12)
    cx = {"left": x0 - 2, "inner": x0 + 22}.get(pos, x1 - 14)
    cy, r = y0 - 2, 15
    c.d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=tone, outline=BG, width=3)
    c.text((cx, cy), str(n), "sm_b", (10, 12, 16), anchor="mm")


# --------------------------------------------------------------------------
# video: encoding
# --------------------------------------------------------------------------
def ffmpeg_bin() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg  # type: ignore

    return imageio_ffmpeg.get_ffmpeg_exe()


class VideoWriter:
    """Streams PIL frames into ffmpeg (H.264, yuv420p, faststart)."""

    def __init__(self, out_path: str, size=(1440, 800), fps=30, audio: str | None = None):
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        self.size, self.fps, self.out = size, fps, out_path
        cmd = [
            ffmpeg_bin(), "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{size[0]}x{size[1]}", "-r", str(fps), "-i", "-",
        ]
        if audio and os.path.exists(audio):
            cmd += ["-i", audio, "-c:a", "aac", "-b:a", "128k", "-shortest"]
        else:
            cmd += ["-an"]
        cmd += [
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path,
        ]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        self.frames = 0

    def frame(self, img: Image.Image, hold: int = 1):
        if img.size != self.size:
            img = img.resize(self.size, Image.LANCZOS)
        data = img.convert("RGB").tobytes()
        for _ in range(max(1, hold)):
            self.proc.stdin.write(data)  # type: ignore[union-attr]
            self.frames += 1

    def hold(self, img: Image.Image, seconds: float):
        self.frame(img, max(1, int(seconds * self.fps)))

    def close(self):
        if self.proc.stdin:
            self.proc.stdin.close()
        self.proc.wait()
        return self.out


def make_still(name: str, draw: Callable[[Canvas], None], width=1440, height=860) -> str:
    c = Canvas(width, height)
    draw(c)
    path = os.path.join(IMAGES, name)
    c.save(path)
    print(f"  still  {name}")
    return path
