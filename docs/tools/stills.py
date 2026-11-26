#!/usr/bin/env python3
"""Renders every PNG used by the README, the tutorial and the release notes."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

from render import (  # noqa: E402
    ACCENT, ACCENT_SOFT, BG, BORDER, ERR, INFO, OK, PURPLE, SURFACE, SURFACE_2,
    SURFACE_3, TEXT, TEXT_DIM, TEXT_MUTED, WARN, Canvas, callout, font, footer,
    header, make_still, sidebar, window,
)

W, H = 1440, 860


def shell(c: Canvas, active, title, subtitle, actions=()):
    """Draw window chrome on the caller's canvas and return its layout anchors."""
    window(c)
    w = sidebar(c, active)
    y = header(c, w, title, subtitle, actions)
    footer(c)
    return w, y


# --------------------------------------------------------------------------
# hero
# --------------------------------------------------------------------------
def hero(c: Canvas):
    glow = Image.new("RGB", (c.w, c.h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((780, -320, 1900, 620), fill=(13, 60, 68))
    gd.ellipse((-420, 440, 640, 1240), fill=(28, 23, 62))
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    c.img = Image.blend(Image.new("RGB", (c.w, c.h), BG), glow, 0.8)
    c.d = ImageDraw.Draw(c.img)

    c.chip((96, 74), "OPEN SOURCE · DESKTOP-FIRST · APACHE-2.0", "accent", "xs")
    c.text((96, 124), "ARQENIUM", "sm_b", ACCENT)
    big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56)
    c.d.text((96, 152), "Engineering", font=big, fill=TEXT)
    c.d.text((96, 216), "command center", font=big, fill=(118, 226, 236))
    c.wrap(
        (96, 304),
        "Multi-agent orchestration, real project intelligence, MCP integrations, "
        "TraceX observability and an evaluation lab — in one local, auditable app.",
        560,
        "body",
        TEXT_DIM,
        lh=27,
    )
    x = 96
    for label, tone in (("Demo runs out of the box", "accent"), ("100 tests passing", "ok"), ("No telemetry", "purple")):
        x = c.chip((x, 386), label, tone, "sm") + 10
    c.text((96, 458), "git clone → npm install → npm run dev", "mono", TEXT_MUTED)

    # product window
    px, py, pw, ph = 700, 96, 660, 470
    c.rect((px + 8, py + 14, px + pw + 8, py + ph + 14), fill=(6, 8, 11), radius=16)
    c.rect((px, py, px + pw, py + ph), fill=SURFACE, outline=BORDER, radius=14)
    c.rect((px, py, px + pw, py + 34), fill=(16, 19, 24), radius=14)
    c.rect((px, py + 24, px + pw, py + 34), fill=(16, 19, 24))
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        c.dot((px + 20 + i * 16, py + 17), col, 4)
    c.text((px + pw / 2, py + 17), "ARQENIUM — Overview", "xs", TEXT_MUTED, anchor="mm")

    c.rect((px, py + 34, px + 148, py + ph), fill=(20, 23, 29))
    for i, label in enumerate(["Overview", "Runs", "Projects", "Agents", "Integrations", "Evaluation", "Observability"]):
        on = i == 0
        yy = py + 48 + i * 32
        if on:
            c.rect((px + 8, yy - 4, px + 140, yy + 22), fill=SURFACE_3, radius=6)
            c.rect((px + 8, yy - 4, px + 11, yy + 22), fill=ACCENT, radius=2)
        c.text((px + 22, yy + 9), label, "xs", TEXT if on else TEXT_MUTED, anchor="lm")

    for i, (label, value, tone) in enumerate([("Runs today", "12", ACCENT), ("Tasks", "184", OK), ("Tool calls", "962", INFO)]):
        bx = px + 164 + i * 110
        c.rect((bx, py + 50, bx + 100, py + 118), fill=SURFACE_2, outline=BORDER, radius=10)
        c.text((bx + 10, py + 58), label, "xs", TEXT_MUTED)
        c.text((bx + 10, py + 76), value, "h2", tone)

    c.rect((px + 164, py + 132, px + 486, py + 228), fill=SURFACE_2, outline=BORDER, radius=10)
    c.text((px + 178, py + 142), "Throughput (7d)", "xs", TEXT_MUTED)
    pts = []
    for i in range(45):
        vx = px + 178 + i * 6.7
        vy = py + 212 - (14 + 18 * abs(math.sin(i / 3.4)) * (0.55 + 0.45 * math.cos(i / 6.5)))
        pts.append((vx, vy))
    c.d.line(pts, fill=ACCENT, width=2, joint="curve")

    c.rect((px + 164, py + 242, px + 486, py + 412), fill=SURFACE_2, outline=BORDER, radius=10)
    c.text((px + 178, py + 252), "Live activity", "xs", TEXT_MUTED)
    c.dot((px + 272, py + 258), OK, 3)
    feed = [
        ("run.completed", "8/8 tasks", OK),
        ("tool.call", "search_symbols · 12", INFO),
        ("approval.approved", "router.ts", WARN),
        ("eval.passed", "3/3 checks", PURPLE),
        ("project.indexed", "36 symbols", ACCENT),
    ]
    for i, (kind, msg, tone) in enumerate(feed):
        yy = py + 274 + i * 26
        c.dot((px + 184, yy + 6), tone, 3)
        c.text((px + 196, yy), kind, "mono_sm", tone)
        c.text((px + 336, yy), msg, "xs", TEXT_DIM)

    c.rect((px + 496, py + 50, px + 646, py + 412), fill=SURFACE_2, outline=BORDER, radius=10)
    c.text((px + 506, py + 62), "Recent runs", "xs", TEXT_MUTED)
    for i, (name, status, tone) in enumerate([("Release check", "done", OK), ("Refactor", "done", OK), ("Docs pass", "run", ACCENT)]):
        yy = py + 88 + i * 74
        c.text((px + 506, yy), name, "xs", TEXT)
        c.chip((px + 506, yy + 16), status, "ok" if tone == OK else "accent", "xs")

    ax, ay = 636, 432
    c.rect((ax + 6, ay + 10, ax + 386, ay + 172), fill=(6, 8, 11), radius=12)
    c.rect((ax, ay, ax + 380, ay + 166), fill=(23, 27, 34), outline=ACCENT, radius=12)
    c.dot((ax + 20, ay + 24), ACCENT, 4)
    c.text((ax + 34, ay + 16), "Approval required", "sm_b", ACCENT)
    c.wrap((ax + 20, ay + 46), "Agent Writer requests write_file → src/lib/router.ts", 330, "xs", TEXT_DIM, lh=17)
    c.rect((ax + 20, ay + 108, ax + 132, ay + 142), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((ax + 76, ay + 125), "Approve", "sm_b", ACCENT, anchor="mm")
    c.rect((ax + 144, ay + 108, ax + 250, ay + 142), fill=SURFACE_3, outline=BORDER, radius=8)
    c.text((ax + 197, ay + 125), "Deny", "sm_b", TEXT_DIM, anchor="mm")

    c.text((96, 634), "Apache-2.0 · built by M11 · github.com/M11-Developer/Arqenium", "sm", TEXT_MUTED)
    for i, (label, tone) in enumerate((("Electron 44", "info"), ("React 19", "accent"), ("Node 22", "ok"), ("SQLite", "purple"), ("MCP 1.x", "warn"))):
        c.chip((96 + i * 128, 668), label, tone, "xs")


# --------------------------------------------------------------------------
# screens
# --------------------------------------------------------------------------
def overview(c: Canvas):
    w, y = shell(c, "overview", "Overview", "Runtime health, activity and the next best action", [("New run", "primary")])
    for i, (label, value, sub, tone) in enumerate(
        [("Projects", "1", "indexed & ready", ACCENT), ("Agents", "4", "1 in demo mode", INFO), ("Runs", "3", "2 completed", OK), ("Approvals", "1", "waiting for you", WARN)]
    ):
        bx = w + 28 + i * 288
        c.panel((bx, y, bx + 270, y + 112))
        c.text((bx + 18, y + 14), label, "sm", TEXT_MUTED)
        c.text((bx + 18, y + 34), value, "h1", TEXT)
        c.text((bx + 18, y + 82), sub, "xs", tone)

    c.panel((w + 28, y + 128, w + 880, y + 470))
    c.text((w + 46, y + 142), "Live activity", "h3", TEXT)
    c.dot((w + 700, y + 152), OK, 4)
    c.text((w + 712, y + 144), "SSE stream", "xs", TEXT_MUTED)
    rows = [
        ("run.completed", "Release check finished — 8/8 tasks", "just now", OK),
        ("task.completed", "Reviewer finished review of router.ts", "12s ago", OK),
        ("tool.call", "search_symbols · 12 results · 34 ms", "20s ago", INFO),
        ("approval.approved", "write_file src/lib/router.ts by you", "1m ago", WARN),
        ("project.indexed", "9 files · 36 symbols · 10 edges", "2m ago", ACCENT),
        ("eval.passed", "Fixture integrity — 3 of 3 passed", "3m ago", PURPLE),
    ]
    for i, (kind, msg, when, tone) in enumerate(rows):
        yy = y + 180 + i * 44
        c.dot((w + 52, yy + 8), tone, 4)
        c.text((w + 68, yy), kind, "mono_sm", tone)
        c.text((w + 232, yy), msg, "sm", TEXT_DIM)
        c.text((w + 844, yy + 1), when, "xs", TEXT_MUTED, anchor="ra")
        if i < len(rows) - 1:
            c.d.line([(w + 46, yy + 26), (w + 856, yy + 26)], fill=(30, 34, 42))
    callout(c, (w + 28, y + 128, w + 880, y + 470), 1, "every action lands here")

    c.panel((w + 900, y + 128, c.w - 28, y + 470))
    c.text((w + 918, y + 142), "Modules", "h3", TEXT)
    mods = [
        ("Project intelligence", True),
        ("Agent control", True),
        ("TraceX", True),
        ("OpenBridge (MCP)", True),
        ("Evaluation lab", True),
        ("EchoShell", False),
        ("Rebuild Studio", False),
    ]
    for i, (name, on) in enumerate(mods):
        yy = y + 176 + i * 36
        c.text((w + 918, yy), name, "sm", TEXT_DIM if on else TEXT_MUTED)
        c.chip((c.w - 152, yy - 5), "on" if on else "off", "ok" if on else "neutral", "xs")
        c.rect((c.w - 76, yy - 5, c.w - 38, yy + 15), fill=ACCENT_SOFT if on else SURFACE_3, radius=99)
        c.d.ellipse((c.w - 54 if on else c.w - 74, yy - 1, c.w - 44 if on else c.w - 64, yy + 9), fill=ACCENT if on else TEXT_MUTED)
    callout(c, (w + 900, y + 128, c.w - 28, y + 470), 2, "the module gate")

    c.panel((w + 28, y + 486, c.w - 28, y + 600))
    c.text((w + 46, y + 498), "Start something", "h3", TEXT)
    steps = ["Add a project", "Create an agent", "Run a pipeline", "Watch TraceX", "Evaluate"]
    x = w + 46
    for i, s in enumerate(steps):
        cw = c.measure(s, "sm") + 34
        c.rect((x, y + 530, x + cw, y + 566), fill=SURFACE_2, outline=BORDER, radius=8)
        c.text((x + 17, y + 548), s, "sm", TEXT_DIM, anchor="lm")
        x += cw + 8
        if i < len(steps) - 1:
            c.arrow((x - 4, y + 548), (x + 4, y + 548), TEXT_MUTED, 2)
            x += 14
    callout(c, (w + 28, y + 486, c.w - 28, y + 600), 3, "the happy path")


def run_wizard(c: Canvas):
    w, y = shell(c, "runs", "New run", "Compose a pipeline of agents and tasks", [("Create run", "primary")])
    x = w + 28
    for i, s in enumerate(["Tasks", "Agents", "Budget", "Review"]):
        done, cur = i < 2, i == 2
        c.dot((x + 12, y + 16), ACCENT if cur else (OK if done else SURFACE_3), 11)
        c.text((x + 12, y + 16), str(i + 1), "xs", (10, 12, 16) if (cur or done) else TEXT_MUTED, anchor="mm")
        c.text((x + 30, y + 9), s, "sm_b" if cur else "sm", TEXT if cur else TEXT_DIM)
        x += 140
    y += 52

    c.panel((w + 28, y, w + 880, y + 348))
    c.text((w + 46, y + 14), "Tasks", "h3", TEXT)
    tasks = [
        ("Plan the change", "Planner", "1", None),
        ("Implement the change", "Implementer", "2", "after task 1"),
        ("Review the diff", "Reviewer", "3", "after task 2"),
    ]
    for i, (title, role, n, dep) in enumerate(tasks):
        yy = y + 48 + i * 92
        c.rect((w + 46, yy, w + 862, yy + 84), fill=SURFACE_2, outline=BORDER, radius=10)
        c.rect((w + 46, yy, w + 50, yy + 84), fill=ACCENT if i == 0 else SURFACE_3, radius=3)
        c.text((w + 66, yy + 10), title, "sm_b", TEXT)
        cx = c.chip((w + 66, yy + 32), role, "accent", "xs") + 8
        cx = c.chip((cx, yy + 32), "demo", "neutral", "xs") + 8
        if dep:
            c.chip((cx, yy + 32), dep, "purple", "xs")
        c.text((w + 66, yy + 66), f"priority 50 · max 1 attempt · pipeline stage {n}", "xs", TEXT_MUTED)
        for k in range(3):
            c.d.line([(w + 826, yy + 36 + k * 8), (w + 846, yy + 36 + k * 8)], fill=TEXT_MUTED, width=2)
    callout(c, (w + 46, y + 48, w + 862, y + 320), 1, "drag to reorder")

    c.panel((w + 900, y, c.w - 28, y + 348))
    c.text((w + 918, y + 14), "Task details", "h3", TEXT)
    for i, (k, v) in enumerate([("Title", "Plan the change"), ("Agent", "Planner"), ("Depends on", "—"), ("Max attempts", "1"), ("Input", "Summarise the router change")]):
        yy = y + 48 + i * 54
        c.text((w + 918, yy), k, "xs", TEXT_MUTED)
        c.rect((w + 918, yy + 16, c.w - 46, yy + 48), fill=SURFACE_3, outline=BORDER, radius=8)
        c.text((w + 930, yy + 32), v, "sm", TEXT_DIM, anchor="lm")
    callout(c, (w + 900, y + 8, c.w - 28, y + 340), 2, "task fields")

    y += 364
    c.panel((w + 28, y, w + 880, y + 130))
    c.text((w + 46, y + 14), "Budget & mode", "h3", TEXT)
    c.text((w + 46, y + 44), "Mode", "xs", TEXT_MUTED)
    c.chip((w + 46, y + 60), "Demo (no model needed)", "accent", "xs")
    for i, (k, v, pct) in enumerate([("Max duration", "10 min", 0.32), ("Max tool calls", "60", 0.18), ("Max tokens", "400k", 0.12)]):
        bx = w + 300 + i * 190
        c.text((bx, y + 44), k, "xs", TEXT_MUTED)
        c.text((bx, y + 62), v, "sm_b", TEXT)
        c.bar((bx, y + 88, bx + 160, y + 96), pct, ACCENT)
    callout(c, (w + 28, y, w + 880, y + 130), 3, "budgets are enforced")
    c.panel((w + 900, y, c.w - 28, y + 130))
    c.text((w + 918, y + 14), "Estimated", "h3", TEXT)
    c.text((w + 918, y + 44), "3 tasks · 2 tool calls · ~8 s", "sm", TEXT_DIM)
    c.text((w + 918, y + 70), "Cost: $0.00 (demo)", "sm", OK)


def run_detail(c: Canvas):
    w, y = shell(c, "runs", "Release check", "run_9dd12b1d · demo mode · triggered by you", [("Cancel run", "ghost")])
    c.chip((w + 28, y + 14), "completed", "ok", "xs")
    c.text((w + 148, y + 20), "2 tasks · 2 completed · 0 failed · 13 ms", "xs", TEXT_MUTED, anchor="lm")
    y += 46

    c.panel((w + 28, y, w + 700, y + 430))
    c.text((w + 46, y + 14), "Task timeline", "h3", TEXT)
    for i, title in enumerate(["Summarise the project", "Follow up on the summary"]):
        yy = y + 56 + i * 152
        c.rect((w + 46, yy, w + 682, yy + 132), fill=SURFACE_2, outline=BORDER, radius=10)
        c.text((w + 64, yy + 12), title, "sm_b", TEXT)
        c.chip((w + 64, yy + 38), "completed", "ok", "xs")
        c.text((w + 160, yy + 44), "agent Planner · 1 attempt", "xs", TEXT_MUTED)
        c.text((w + 64, yy + 68), "output", "xs", TEXT_MUTED)
        c.rect((w + 64, yy + 84, w + 664, yy + 120), fill=(13, 15, 19), radius=6)
        c.text((w + 76, yy + 92), "Demo agent output (sample data — not generated by a real model).", "mono_sm", TEXT_DIM)
        c.text((w + 76, yy + 108), "Observed tool result: { total: 2, symbols: [...] }", "mono_sm", TEXT_MUTED)
        if i == 0:
            c.arrow((w + 364, yy + 132), (w + 364, yy + 152), TEXT_MUTED, 2)
    callout(c, (w + 46, y + 56, w + 682, y + 340), 1, "dependencies enforced")
    c.panel((w + 46, y + 340, w + 682, y + 416))
    c.text((w + 64, y + 352), "Pipeline", "xs", TEXT_MUTED)
    px = w + 64
    for i, stage in enumerate(["Planner", "Implementer", "Reviewer"]):
        cw = c.measure(stage, "xs") + 26
        c.rect((px, y + 372, px + cw, y + 402), fill=SURFACE_2, outline=ACCENT if i == 0 else BORDER, radius=7)
        c.text((px + cw / 2, y + 387), stage, "xs", ACCENT if i == 0 else TEXT_DIM, anchor="mm")
        px += cw + 6
        if i < 2:
            c.arrow((px, y + 395), (px + 10, y + 395), TEXT_MUTED, 2)
            px += 18

    c.panel((w + 716, y, c.w - 28, y + 250))
    c.text((w + 734, y + 14), "TraceX timeline", "h3", TEXT)
    for i, (e, tone) in enumerate([("run.started", OK), ("task.started", INFO), ("tool.call", ACCENT), ("task.completed", OK), ("run.completed", OK)]):
        yy = y + 50 + i * 36
        c.dot((w + 740, yy + 6), tone, 4)
        if i < 4:
            c.d.line([(w + 740, yy + 12), (w + 740, yy + 32)], fill=(40, 46, 56), width=2)
        c.text((w + 756, yy), e, "mono_sm", tone)
        c.text((c.w - 46, yy), f"{4 + i * 3} ms", "xs", TEXT_MUTED, anchor="ra")
    callout(c, (w + 716, y, c.w - 28, y + 250), 2, "every step recorded")

    c.panel((w + 716, y + 266, c.w - 28, y + 444))
    c.text((w + 734, y + 280), "Approvals", "h3", TEXT)
    c.rect((w + 734, y + 312, c.w - 46, y + 404), fill=(26, 30, 38), outline=WARN, radius=10)
    c.text((w + 750, y + 322), "write_file · pending", "sm_b", WARN)
    c.text((w + 750, y + 346), "src/lib/router.ts", "mono_sm", TEXT_DIM)
    c.rect((w + 750, y + 366, w + 858, y + 396), fill=ACCENT_SOFT, outline=ACCENT, radius=6)
    c.text((w + 804, y + 381), "Approve", "xs", ACCENT, anchor="mm")
    c.rect((w + 868, y + 366, w + 972, y + 396), fill=SURFACE_3, outline=BORDER, radius=6)
    c.text((w + 920, y + 381), "Deny", "xs", TEXT_DIM, anchor="mm")
    callout(c, (w + 734, y + 312, c.w - 46, y + 404), 3, "nothing writes silently")

    y += 460
    c.panel((w + 28, y, c.w - 28, y + 116))
    c.text((w + 46, y + 14), "Run stats", "h3", TEXT)
    for i, (k, v) in enumerate([("Tool calls", "2"), ("Provider requests", "4"), ("Tokens in", "0"), ("Tokens out", "0"), ("Est. cost", "—")]):
        bx = w + 46 + i * 216
        c.text((bx, y + 48), k, "xs", TEXT_MUTED)
        c.text((bx, y + 66), v, "h2", ACCENT if i < 2 else TEXT_DIM)


def projects(c: Canvas):
    w, y = shell(c, "projects", "Projects", "Local repositories, indexed with real parsers", [("Reindex", "ghost"), ("Add project", "primary")])
    c.panel((w + 28, y, w + 340, y + 470))
    c.text((w + 46, y + 14), "fixture-app", "h3", TEXT)
    c.text((w + 46, y + 40), "/home/you/code/fixture-app", "xs", TEXT_MUTED)
    c.bar((w + 46, y + 62, w + 322, y + 68), 1.0, OK)
    c.text((w + 46, y + 76), "9 files · 36 symbols · 10 edges · 73 ms", "xs", TEXT_DIM)
    tree = [(0, "src", "dir"), (1, "index.ts", "ts"), (1, "service.py", "py"), (1, "lib", "dir"), (2, "router.ts", "ts"),
            (2, "config.ts", "ts"), (2, "format.ts", "ts"), (0, "tests", "dir"), (1, "router.test.ts", "ts"), (0, "README.md", "md"), (0, ".env.example", "env")]
    for i, (depth, name, kind) in enumerate(tree):
        yy = y + 110 + i * 30
        if name == "router.ts":
            c.rect((w + 38, yy - 4, w + 332, yy + 22), fill=SURFACE_3, radius=6)
        color = {"dir": TEXT, "ts": INFO, "py": WARN, "md": TEXT_DIM, "env": TEXT_MUTED}[kind]
        icon = {"dir": "▸", "ts": "TS", "py": "PY", "md": "MD", "env": "·"}[kind]
        c.text((w + 50 + depth * 18, yy), icon, "xs", color)
        c.text((w + 74 + depth * 18, yy), name, "sm", color)
    callout(c, (w + 28, y + 8, w + 340, y + 470), 1, "tree from disk")

    c.panel((w + 356, y, w + 900, y + 470))
    c.text((w + 374, y + 14), "src/lib/router.ts", "h3", TEXT)
    c.chip((w + 574, y + 14), "parsed", "ok", "xs")
    c.text((w + 658, y + 16), "42 lines · 3 symbols", "xs", TEXT_MUTED)
    code = [
        "export interface Route { path: string; handler: Handler }",
        "export interface Router { match(path: string): Route | null }",
        "",
        "export function createRouter(routes: Route[]): Router {",
        "  const table = new Map(routes.map((r) => [r.path, r]))",
        "  return {",
        "    match(path) {",
        "      return table.get(path) ?? null",
        "    },",
        "  }",
        "}",
    ]
    for i, line in enumerate(code):
        yy = y + 52 + i * 22
        c.text((w + 374, yy), f"{i + 1:>3}", "mono_sm", TEXT_MUTED)
        color = ACCENT if line.startswith("export") else PURPLE if line.strip().startswith("return") else TEXT_DIM
        c.text((w + 408, yy), line, "mono", color)
    callout(c, (w + 356, y + 8, w + 900, y + 470), 2, "real source, real symbols")

    c.panel((w + 916, y, c.w - 28, y + 470))
    c.text((w + 934, y + 14), "Dependency graph", "h3", TEXT)
    nodes = {
        "index.ts": (w + 1000, y + 118), "router.ts": (w + 1120, y + 190),
        "config.ts": (w + 950, y + 232), "format.ts": (w + 1122, y + 300), "test": (w + 986, y + 336),
    }
    for a, b in [("index.ts", "router.ts"), ("index.ts", "config.ts"), ("router.ts", "format.ts"), ("test", "router.ts")]:
        c.arrow(nodes[a], nodes[b], (70, 90, 110), 2)
    for name, (nx, ny) in nodes.items():
        tone = {"index.ts": ACCENT, "router.ts": INFO, "config.ts": OK, "format.ts": PURPLE, "test": WARN}[name]
        c.d.ellipse((nx - 34, ny - 34, nx + 34, ny + 34), fill=SURFACE_2, outline=tone, width=2)
        c.text((nx, ny), name.replace(".ts", ""), "xs", tone, anchor="mm")
    c.text((w + 934, y + 396), "depth 1 → index.ts · depth 2 → router.ts", "xs", TEXT_DIM)
    c.chip((w + 934, y + 420), "impact: parsed", "accent", "xs")
    callout(c, (w + 916, y + 8, c.w - 28, y + 470), 3, "who breaks if I change this?")


def agents(c: Canvas):
    w, y = shell(c, "agents", "Agents", "Role, tools, permissions and limits — per agent", [("New agent", "primary")])
    cards = [
        ("Planner", "Strategist", "6 tools", "read-only", ACCENT, True),
        ("Implementer", "Builder", "5 tools", "may write", OK, True),
        ("Reviewer", "Critic", "4 tools", "read-only", INFO, True),
        ("Shell operator", "Tester", "7 tools", "runs commands", WARN, False),
        ("Rebuild analyst", "Designer", "3 tools", "may write", PURPLE, False),
        ("Evaluator", "Judge", "2 tools", "read-only", TEXT_DIM, False),
    ]
    for i, (name, role, tools, perm, tone, live) in enumerate(cards):
        bx = w + 28 + (i % 3) * 372
        by = y + (i // 3) * 200
        c.panel((bx, by, bx + 352, by + 182))
        c.rect((bx, by, bx + 352, by + 4), fill=tone, radius=2)
        c.text((bx + 18, by + 20), name, "h3", TEXT)
        c.chip((bx + 18, by + 50), role, "neutral", "xs")
        c.chip((bx + 130, by + 50), "live model" if live else "demo", "accent" if live else "neutral", "xs")
        c.text((bx + 18, by + 88), tools, "sm", TEXT_DIM)
        c.text((bx + 18, by + 108), perm, "xs", TEXT_MUTED)
        c.text((bx + 18, by + 132), "max 8 iterations · 120 s timeout", "xs", TEXT_MUTED)
        c.rect((bx + 18, by + 150, bx + 110, by + 174), fill=SURFACE_3, outline=BORDER, radius=6)
        c.text((bx + 64, by + 162), "Configure", "xs", TEXT_DIM, anchor="mm")
        c.rect((bx + 118, by + 150, bx + 186, by + 174), fill=SURFACE_3, outline=BORDER, radius=6)
        c.text((bx + 152, by + 162), "Delete", "xs", ERR, anchor="mm")

    y2 = y + 396
    c.panel((w + 28, y2, c.w - 28, y2 + 220))
    c.text((w + 46, y2 + 14), "Permission model", "h3", TEXT)
    rows = [
        ("canReadFiles", "read_file · search · structure", OK, "on"),
        ("canWriteFiles", "write_file — always approval-gated", WARN, "role"),
        ("canRunCommands", "run_command — needs EchoShell", ERR, "off"),
        ("autoApprove", "tools that skip the approval prompt", ACCENT, "none"),
    ]
    for i, (key, desc, tone, value) in enumerate(rows):
        yy = y2 + 54 + i * 40
        c.text((w + 46, yy), key, "mono", tone)
        c.text((w + 230, yy), desc, "sm", TEXT_DIM)
        c.chip((c.w - 130, yy - 6), value, "neutral", "xs")
        if i < 3:
            c.d.line([(w + 46, yy + 26), (c.w - 46, yy + 26)], fill=(30, 34, 42))
    callout(c, (w + 28, y2 + 8, c.w - 28, y2 + 220), 2, "least privilege by default")


def integrations(c: Canvas):
    w, y = shell(c, "integrations", "Integrations", "MCP servers, discovered capabilities and tool policy", [("Add server", "primary")])
    c.panel((w + 28, y, w + 520, y + 270))
    c.text((w + 46, y + 14), "Registered servers", "h3", TEXT)
    for i, (name, transport, status, tone, tools) in enumerate([
        ("ARQENIUM internal", "http · 127.0.0.1:4321", "connected", OK, 9),
        ("filesystem", "stdio · npx", "connected", OK, 11),
        ("github", "http · api.github.com", "disconnected", TEXT_MUTED, 24),
    ]):
        yy = y + 50 + i * 70
        c.rect((w + 46, yy, w + 502, yy + 58), fill=SURFACE_2, outline=BORDER, radius=10)
        c.dot((w + 62, yy + 18), tone, 5)
        c.text((w + 78, yy + 10), name, "sm_b", TEXT)
        c.text((w + 78, yy + 30), transport, "mono_sm", TEXT_MUTED)
        c.chip((w + 380, yy + 10), status, "ok" if tone == OK else "neutral", "xs")
        c.text((w + 62, yy + 44), f"{tools} tools", "xs", TEXT_DIM)
    callout(c, (w + 46, y + 50, w + 502, y + 258), 1, "one registry")

    c.panel((w + 536, y, c.w - 28, y + 270))
    c.text((w + 554, y + 14), "Tool policy", "h3", TEXT)
    for i, (name, allowed, auto) in enumerate([
        ("project_structure", True, False), ("search_symbols", True, True), ("search_files", True, False),
        ("impact_analysis", True, True), ("read_file", True, False), ("evaluation_run", False, False),
    ]):
        yy = y + 52 + i * 36
        c.text((w + 554, yy), name, "mono", TEXT_DIM if allowed else TEXT_MUTED)
        c.chip((w + 760, yy - 5), "allowed" if allowed else "denied", "ok" if allowed else "err", "xs")
        if allowed:
            c.chip((w + 856, yy - 5), "auto-approve" if auto else "needs approval", "accent" if auto else "warn", "xs")
    callout(c, (w + 536, y, c.w - 28, y + 270), 2, "explicit allow / deny / auto")

    y2 = y + 286
    c.panel((w + 28, y2, c.w - 28, y2 + 206))
    c.text((w + 46, y2 + 14), "Tool call test", "h3", TEXT)
    c.rect((w + 46, y2 + 44, w + 300, y2 + 76), fill=SURFACE_3, outline=BORDER, radius=8)
    c.text((w + 58, y2 + 60), "search_symbols", "mono", TEXT, anchor="lm")
    c.rect((w + 312, y2 + 44, w + 470, y2 + 76), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 391, y2 + 60), "Invoke tool", "sm_b", ACCENT, anchor="mm")
    c.rect((w + 46, y2 + 90, c.w - 46, y2 + 192), fill=(13, 15, 19), radius=8)
    for i, line in enumerate([
        '{ "ok": true, "durationMs": 4, "server": "ARQENIUM internal" }',
        '{ "total": 2, "symbols": [',
        '    { "name": "parse_records", "path": "src/service.py", "line": 24 },',
        '    { "name": "createRouter",  "path": "src/lib/router.ts", "line": 15 } ] }',
    ]):
        c.text((w + 62, y2 + 104 + i * 22), line, "mono_sm", OK if i == 0 else TEXT_DIM)
    callout(c, (w + 38, y2 + 90, c.w - 38, y2 + 192), 3, "real round trip over MCP")


def evaluation(c: Canvas):
    w, y = shell(c, "evaluation", "Evaluation lab", "Reproducible suites: objective checks + agent judgment", [("Run suite", "primary")])
    c.panel((w + 28, y, w + 380, y + 400))
    c.text((w + 46, y + 14), "Suites", "h3", TEXT)
    for i, (name, kind, cases, score, tone) in enumerate([
        ("Fixture project integrity", "deterministic", 3, "3/3", OK),
        ("Project index checks", "deterministic", 2, "2/2", OK),
        ("Agent engineering tasks", "ai-judged", 2, "2/2", OK),
        ("Negative control", "deterministic", 1, "0/1", ERR),
    ]):
        yy = y + 50 + i * 82
        c.rect((w + 46, yy, w + 362, yy + 70), fill=SURFACE_2, outline=ACCENT if i == 0 else BORDER, radius=10)
        c.text((w + 62, yy + 10), name, "sm_b", TEXT)
        c.chip((w + 62, yy + 34), kind, "accent" if kind == "ai-judged" else "neutral", "xs")
        c.text((w + 200, yy + 40), f"{cases} cases", "xs", TEXT_MUTED)
        c.text((w + 344, yy + 16), score, "sm_b", tone, anchor="ra")
    callout(c, (w + 46, y + 50, w + 362, y + 384), 1, "built-in suites")

    c.panel((w + 396, y, c.w - 28, y + 250))
    c.text((w + 414, y + 14), "Latest run — Fixture project integrity", "h3", TEXT)
    for i, (v, k, tone) in enumerate([("3", "cases", TEXT), ("3", "passed", OK), ("0", "failed", TEXT_MUTED), ("0 ms", "duration", TEXT_DIM)]):
        bx = w + 414 + i * 176
        c.text((bx, y + 50), v, "h2", tone)
        c.text((bx, y + 86), k, "xs", TEXT_MUTED)
    c.bar((w + 414, y + 114, c.w - 46, y + 122), 1.0, OK)
    for i, (name, detail) in enumerate([
        ("Entrypoint declares routes", "all 3 markers · 44 lines"),
        ("Service exports parser", "all 3 markers · 38 lines"),
        ("Operation log has no secrets", "28 events, 0 leaks"),
    ]):
        yy = y + 138 + i * 34
        c.chip((w + 414, yy), "pass", "ok", "xs")
        c.text((w + 480, yy + 5), name, "sm", TEXT_DIM)
        c.text((c.w - 46, yy + 6), detail, "xs", TEXT_MUTED, anchor="ra")
    callout(c, (w + 396, y, c.w - 28, y + 250), 2, "objective vs judgment")

    y2 = y + 266
    c.panel((w + 396, y2, c.w - 28, y2 + 250))
    c.text((w + 414, y2 + 14), "Export", "h3", TEXT)
    for i, label in enumerate(["Copy JSON", "Download CSV"]):
        bx = w + 414 + i * 150
        c.rect((bx, y2 + 44, bx + 132, y2 + 76), fill=ACCENT_SOFT if i == 0 else SURFACE_2, outline=ACCENT if i == 0 else BORDER, radius=8)
        c.text((bx + 66, y2 + 60), label, "sm_b", ACCENT if i == 0 else TEXT_DIM, anchor="mm")
    c.rect((w + 414, y2 + 92, c.w - 46, y2 + 236), fill=(13, 15, 19), radius=8)
    for i, line in enumerate([
        "case,agent,status,objective,subjective,durationMs",
        "Entrypoint declares routes,,pass,all 3 markers observed,,0",
        "Service exports parser,,pass,all 3 markers observed,,0",
        "Operation log has no secrets,,pass,28 events checked,,1",
    ]):
        c.text((w + 430, y2 + 106 + i * 20), line, "mono_sm", ACCENT if i == 0 else TEXT_DIM)
    callout(c, (w + 414, y2 + 92, c.w - 46, y2 + 236), 3, "portable results")


def observability(c: Canvas):
    w, y = shell(c, "observability", "Observability", "TraceX — every event, tool call and decision", [("Export trace", "ghost")])
    x = w + 28
    for f in ["all severities", "all types", "run: any", "search…"]:
        fw = c.measure(f, "sm") + 30
        c.rect((x, y + 16, x + fw, y + 50), fill=SURFACE_2, outline=BORDER, radius=8)
        c.text((x + 15, y + 33), f, "sm", TEXT_DIM, anchor="lm")
        x += fw + 8
    y += 72

    rows = [
        ("12:04:11", "run.completed", "info", "Release check finished — 8/8 tasks", "9 ms"),
        ("12:04:11", "task.completed", "info", "Reviewer finished review of router.ts", "2 ms"),
        ("12:04:10", "tool.call", "info", "search_symbols · 12 results", "34 ms"),
        ("12:04:09", "approval.approved", "warn", "write_file src/lib/router.ts by you", "—"),
        ("12:04:07", "project.indexed", "info", "9 files · 36 symbols · 10 edges", "73 ms"),
        ("12:04:02", "provider.error", "error", "openai: HTTP 401 — invalid key", "180 ms"),
        ("12:04:00", "module.enabled", "info", "echoshell enabled", "—"),
        ("12:03:58", "eval.passed", "info", "Fixture integrity 3/3", "1 ms"),
    ]
    c.panel((w + 28, y, c.w - 28, y + 384))
    c.text((w + 46, y + 14), "Event stream", "h3", TEXT)
    c.chip((c.w - 150, y + 12), "live", "ok", "xs")
    for h, hx in [("time", w + 46), ("type", w + 148), ("severity", w + 330), ("message", w + 452), ("duration", c.w - 138)]:
        c.text((hx, y + 44), h.upper(), "xs", TEXT_MUTED)
    c.d.line([(w + 46, y + 64), (c.w - 46, y + 64)], fill=BORDER)
    tone_of = {"info": TEXT_DIM, "warn": WARN, "error": ERR}
    for i, (ts, kind, sev, msg, dur) in enumerate(rows):
        yy = y + 78 + i * 38
        if i == 5:
            c.rect((w + 38, yy - 8, c.w - 38, yy + 26), fill=(40, 20, 22), radius=6)
        c.text((w + 46, yy), ts, "mono_sm", TEXT_MUTED)
        c.text((w + 148, yy), kind, "mono_sm", ACCENT)
        c.chip((w + 330, yy - 4), sev, "err" if sev == "error" else "warn" if sev == "warn" else "neutral", "xs")
        c.text((w + 452, yy), msg, "sm", tone_of[sev])
        c.text((c.w - 62, yy), dur, "xs", TEXT_MUTED, anchor="ra")
    callout(c, (w + 20, y - 64, w + 680, y - 14), 1, "filter by anything")


def terminal(c: Canvas):
    w, y = shell(c, "terminal", "Terminal", "EchoShell — preview, approve, then execute", [("New session", "primary")])
    c.panel((w + 28, y, c.w - 28, y + 196))
    c.text((w + 46, y + 14), "Command preview", "h3", TEXT)
    c.rect((w + 46, y + 46, c.w - 46, y + 84), fill=(13, 15, 19), outline=BORDER, radius=8)
    c.text((w + 62, y + 65), "$ ls -la src", "mono", TEXT, anchor="lm")
    c.chip((c.w - 300, y + 54), "risk: low", "ok", "xs")
    c.chip((c.w - 190, y + 54), "not blocked", "ok", "xs")
    c.text((w + 46, y + 98), 'argv  ["ls", "-la", "src"]   ·   cwd  fixture-app   ·   no shell operators', "xs", TEXT_MUTED)
    c.rect((w + 46, y + 126, w + 190, y + 162), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 118, y + 144), "Approve & run", "sm_b", ACCENT, anchor="mm")
    c.rect((w + 202, y + 126, w + 320, y + 162), fill=SURFACE_2, outline=BORDER, radius=8)
    c.text((w + 261, y + 144), "Explain", "sm_b", TEXT_DIM, anchor="mm")
    c.text((w + 336, y + 144), "runs only after the approval is recorded", "xs", WARN, anchor="lm")
    callout(c, (w + 38, y + 46, c.w - 38, y + 162), 1, "nothing runs unseen")

    y2 = y + 212
    c.panel((w + 28, y2, c.w - 28, y2 + 176))
    c.text((w + 46, y2 + 14), "Output", "h3", TEXT)
    for i, (label, tone) in enumerate([("exit 0", "ok"), ("7 lines", "neutral"), ("12 ms", "neutral")]):
        c.chip((c.w - 340 + i * 100, y2 + 12), label, tone, "xs")
    for i, line in enumerate(["drwxr-xr-x  index.ts        1.2k", "drwxr-xr-x  service.py      0.9k", "drwxr-xr-x  lib/            4 entries", "-rw-r--r--  README.md       2.1k"]):
        c.text((w + 52, y2 + 50 + i * 22), line, "mono_sm", TEXT_DIM)
    c.rect((w + 46, y2 + 146, c.w - 46, y2 + 172), fill=SURFACE, radius=0) if False else None
    callout(c, (w + 38, y2 + 44, c.w - 38, y2 + 140), 2, "recorded output")

    y3 = y2 + 192
    c.panel((w + 28, y3, c.w - 28, y3 + 156))
    c.text((w + 46, y3 + 14), "Blocked & high risk", "h3", TEXT)
    for i, (cmd, why, tone) in enumerate([
        ("rm -rf /", "blocked: recursive delete of a root directory", ERR),
        ("git push origin main", "high risk: publishes to a remote", WARN),
        ("cat ../../../etc/passwd", "high risk: parent-directory reference", WARN),
        ("ls | wc -l", "rejected: shell operators are not supported", ERR),
    ]):
        yy = y3 + 48 + i * 26
        c.text((w + 52, yy), cmd, "mono", tone)
        c.text((w + 336, yy), why, "xs", TEXT_DIM)
    callout(c, (w + 38, y3 + 42, c.w - 38, y3 + 148), 3, "fail closed")


def rebuild(c: Canvas):
    w, y = shell(c, "rebuild", "Rebuild Studio", "Measure a reference screenshot, propose code", [("Capture", "primary")])
    c.panel((w + 28, y, w + 452, y + 440))
    c.text((w + 46, y + 14), "Reference", "h3", TEXT)
    c.rect((w + 46, y + 48, w + 434, y + 250), fill=(13, 15, 19), outline=BORDER, radius=8)
    c.rect((w + 46, y + 48, w + 434, y + 92), fill=(26, 31, 39), radius=8)
    c.rect((w + 60, y + 60, w + 118, y + 76), fill=ACCENT, radius=4)
    c.rect((w + 46, y + 112, w + 434, y + 140), fill=(232, 236, 241), radius=4)
    for i in range(3):
        c.rect((w + 46, y + 156 + i * 18, w + 434, y + 162 + i * 18), fill=(70, 78, 92), radius=3)
    c.rect((w + 46, y + 210, w + 180, y + 240), fill=ACCENT, radius=6)
    c.text((w + 46, y + 264), "640 × 400 · PNG · 1.8 KB", "xs", TEXT_MUTED)
    c.text((w + 46, y + 286), "palette", "xs", TEXT_MUTED)
    for i, (col, share) in enumerate([((12, 12, 16), "68%"), ((24, 28, 32), "16%"), ((60, 64, 76), "8%"), ((232, 236, 240), "4%")]):
        bx = w + 46 + i * 100
        c.rect((bx, y + 304, bx + 88, y + 336), fill=col, outline=BORDER, radius=6)
        c.text((bx + 4, y + 342), share, "xs", TEXT_DIM)
    callout(c, (w + 28, y + 8, w + 452, y + 250), 1, "measured, not guessed")

    c.panel((w + 468, y, w + 900, y + 440))
    c.text((w + 486, y + 14), "Analysis", "h3", TEXT)
    for i, (k, v) in enumerate([
        ("dominant background", "#0c0c10"), ("dominant text", "#e8ecf0"), ("contrast ratio", "16.4 : 1"),
        ("bands detected", "14"), ("content width", "639 px"), ("layout model", "full-width sections"),
    ]):
        c.text((w + 486, y + 50 + i * 38), k, "xs", TEXT_MUTED)
        c.text((w + 486, y + 66 + i * 38), v, "mono", TEXT)
    c.chip((w + 486, y + 280), "confidence: low", "warn", "xs")
    c.text((w + 486, y + 320), "Inferred — spacing scale, components, responsive rules", "xs", WARN)
    c.wrap((w + 486, y + 340), "A single screenshot cannot prove hover states, motion or breakpoints.", 380, "xs", TEXT_MUTED, lh=16)
    callout(c, (w + 468, y + 8, w + 900, y + 440), 2, "facts vs inference")

    c.panel((w + 916, y, c.w - 28, y + 440))
    c.text((w + 934, y + 14), "Proposed files", "h3", TEXT)
    for i, (name, size) in enumerate([("tokens.css", 351), ("index.html", 5166), ("ANALYSIS.md", 1292)]):
        yy = y + 50 + i * 38
        c.rect((w + 934, yy, c.w - 46, yy + 30), fill=SURFACE_2, outline=BORDER, radius=7)
        c.text((w + 946, yy + 8), name, "mono", ACCENT)
        c.text((c.w - 58, yy + 9), f"{size} B", "xs", TEXT_MUTED, anchor="ra")
    c.rect((w + 934, y + 170, c.w - 46, y + 300), fill=(13, 15, 19), radius=8)
    for i, line in enumerate([":root {", "  --bg: #0c0c10;", "  --fg: #e8ecf0;", "  --accent: #35c8d8;", "  --radius: 8px;", "}", "", "header { background: #181c20; }"]):
        c.text((w + 948, y + 184 + i * 15), line, "mono_sm", TEXT_DIM)
    c.rect((w + 934, y + 316, c.w - 46, y + 352), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 934 + (c.w - 46 - w - 934) / 2, y + 334), "Write files (needs approval)", "sm_b", ACCENT, anchor="mm")
    callout(c, (w + 916, y + 8, c.w - 28, y + 360), 3, "estimated, labelled")


def settings(c: Canvas):
    w, y = shell(c, "settings", "Settings", "Providers, context, credentials, runtime and storage")
    x = w + 28
    ty = y + 15
    for i, t in enumerate(["AI providers", "Project context", "Credentials", "Runtime", "Data & storage"]):
        tw = c.measure(t, "sm") + 34
        if i == 0:
            c.rect((x, ty, x + tw, ty + 34), fill=SURFACE_3, radius=8)
        c.text((x + 17, ty + 17), t, "sm_b" if i == 0 else "sm", TEXT if i == 0 else TEXT_DIM, anchor="lm")
        x += tw + 6
    y += 64

    c.panel((w + 28, y, c.w - 28, y + 200))
    c.chip((w + 46, y + 16), "Demo (built in)", "accent", "xs")
    c.text((w + 190, y + 20), "no key required · deterministic, labelled sample data", "xs", TEXT_MUTED)
    c.chip((c.w - 200, y + 16), "active", "ok", "xs")
    for i, (k, v) in enumerate([("Base URL", "internal"), ("Default model", "demo-deterministic"), ("Tool calling", "yes"), ("Streaming", "no")]):
        yy = y + 56 + i * 30
        c.text((w + 46, yy), k, "xs", TEXT_MUTED)
        c.text((w + 190, yy), v, "mono", TEXT_DIM)
    c.rect((w + 420, y + 52, w + 600, y + 88), fill=SURFACE_2, outline=BORDER, radius=8)
    c.text((w + 510, y + 70), "Test connection", "sm_b", TEXT_DIM, anchor="mm")
    c.text((w + 46, y + 172), 'Capabilities are declared — this adapter cannot stream, so it says no.', "xs", TEXT_MUTED)
    callout(c, (w + 28, y + 8, c.w - 28, y + 200), 1, "honest capabilities")

    y += 216
    c.panel((w + 28, y, c.w - 28, y + 200))
    c.text((w + 46, y + 14), "Add provider", "h3", TEXT)
    for i, (k, v) in enumerate([
        ("Kind", "OpenAI / Anthropic / Gemini / Ollama / compatible"),
        ("Name", "Work key"),
        ("Base URL", "https://api.example.com/v1"),
        ("API key", "•••••••••••••••• stored in the local credential store"),
    ]):
        yy = y + 48 + i * 38
        c.text((w + 46, yy), k, "xs", TEXT_MUTED)
        c.rect((w + 170, yy - 4, c.w - 46, yy + 26), fill=SURFACE_3, outline=BORDER, radius=7)
        c.text((w + 182, yy + 11), v, "mono_sm", TEXT_DIM if i < 3 else WARN, anchor="lm")
    c.rect((c.w - 220, y + 164, c.w - 46, y + 192), fill=ACCENT_SOFT, outline=ACCENT, radius=7)
    c.text((c.w - 133, y + 178), "Save provider", "xs", ACCENT, anchor="mm")
    callout(c, (w + 28, y + 8, c.w - 28, y + 200), 2, "keys never leave the machine")

    y += 216
    c.panel((w + 28, y, c.w - 28, y + 150))
    c.text((w + 46, y + 14), "Data & storage", "h3", TEXT)
    for i, (k, v) in enumerate([
        ("Database", "~/.local/share/arqenium/arqenium.db"),
        ("Runtime", "web (HTTP API on 127.0.0.1:4319)"),
        ("Telemetry", "disabled — always"),
        ("Event retention", "30 days"),
    ]):
        yy = y + 48 + i * 26
        c.text((w + 46, yy), k, "xs", TEXT_MUTED)
        c.text((w + 190, yy), v, "mono_sm", TEXT_DIM)
    callout(c, (w + 28, y + 8, c.w - 28, y + 150), 3, "everything is local")


def modules(c: Canvas):
    w, y = shell(c, "modules", "Modules", "Enable the capabilities you need; core modules stay on")
    badges = [
        ("Project intelligence", "core", True, "Parsers, symbols, graph, impact"),
        ("Agent control", "core", True, "Roles, tools, permissions, orchestration"),
        ("TraceX", "core", True, "Event log, tool calls, timeline"),
        ("OpenBridge", "core", True, "MCP client + internal MCP server"),
        ("Evaluation", "core", True, "Suites, runs, exports"),
        ("Providers", "core", True, "Adapters, credentials, health"),
        ("Shared context", "core", True, "Conventions injected into prompts"),
        ("EchoShell", "optional", False, "Preview → approve → execute commands"),
        ("Rebuild Studio", "optional", False, "Screenshot → measured reconstruction"),
    ]
    for i, (name, kind, on, desc) in enumerate(badges):
        bx = w + 28 + (i % 3) * 372
        by = y + (i // 3) * 172
        c.panel((bx, by, bx + 352, by + 156))
        c.text((bx + 18, by + 18), name, "h3", TEXT)
        c.chip((bx + 18, by + 48), kind, "neutral" if kind == "core" else "warn", "xs")
        if on:
            c.chip((bx + 92, by + 48), "enabled", "ok", "xs")
        c.wrap((bx + 18, by + 82), desc, 300, "xs", TEXT_MUTED, lh=16)
        ox = bx + 290
        c.rect((ox, by + 18, ox + 44, by + 42), fill=ACCENT_SOFT if on else SURFACE_3, radius=99)
        c.d.ellipse((ox + 24 if on else ox + 2, by + 22, ox + 40 if on else ox + 18, by + 38), fill=ACCENT if on else TEXT_MUTED)
        c.text((bx + 18, by + 126), "cannot be disabled" if kind == "core" else "disabled by default · opt in", "xs", TEXT_MUTED if kind == "core" else WARN)

    y2 = y + 540
    c.rect((w + 28, y2, c.w - 28, y2 + 62), fill=(50, 38, 16), outline=WARN, radius=10)
    c.text((w + 48, y2 + 14), "Module gate enforced in the backend", "sm_b", WARN)
    c.text((w + 48, y2 + 36), "Calling a disabled module returns module_disabled (HTTP 403) — the UI cannot bypass it.", "xs", TEXT_DIM)
    callout(c, (w + 28, y2 + 8, c.w - 28, y2 + 62), 2, "not just hidden buttons")


def architecture(c: Canvas):
    c.rect((0, 0, c.w, c.h), fill=BG)
    c.text((60, 44), "Architecture", "h1", TEXT)
    c.text((60, 84), "Modular monolith · one validated request path · local-first", "sm", TEXT_DIM)

    layers = [
        ("Renderer — React 19", "12 routes · zustand store · SSE live events · design tokens", ACCENT, 132, "renderer/"),
        ("Preload bridge", "contextIsolation · narrow typed surface · no node in the page", PURPLE, 244, "electron/preload.ts"),
        ("Dispatcher", "strict zod parse → channel route · single allow-list of 91 channels", INFO, 356, "core/dispatcher.ts"),
        ("Core services", "projects · agents · orchestration · providers · MCP · evals · traces · shell · rebuild", OK, 468, "core/*"),
        ("Persistence & runtime", "SQLite (WAL) · migrations · credentials · filesystem guards", WARN, 570, "core/db"),
    ]
    for name, sub, tone, y0, path_label in layers:
        c.rect((60, y0, c.w - 330, y0 + 88), fill=SURFACE, outline=tone, radius=12)
        c.rect((60, y0, 68, y0 + 88), fill=tone, radius=4)
        c.text((94, y0 + 16), name, "h2", TEXT)
        c.text((94, y0 + 50), sub, "sm", TEXT_DIM)
        c.text((c.w - 344, y0 + 64), path_label, "mono_sm", TEXT_MUTED, anchor="ra")
        if y0 < 570:
            c.arrow((c.w / 2 - 134, y0 + 88), (c.w / 2 - 134, y0 + 108), TEXT_MUTED, 2)

    for y0, note, tone in [
        (132, "Browser preview uses HTTP + SSE instead", ACCENT),
        (356, "invalid input never reaches a service", INFO),
        (468, "services are constructor-injected", OK),
    ]:
        c.text((c.w - 60, y0 + 8), note, "xs", tone, anchor="ra")

    tx = c.w - 310
    c.text((tx, 106), "TRANSPORTS", "xs", TEXT_MUTED)
    for title, lines, tone, y0 in [
        ("Electron IPC", ["arq:invoke", "arq:event (push)"], ACCENT, 132),
        ("HTTP API", ["POST /api/invoke", "GET /api/events (SSE)"], INFO, 244),
    ]:
        c.rect((tx, y0, c.w - 60, y0 + 96), fill=SURFACE_2, outline=tone, radius=10)
        c.text((tx + 14, y0 + 12), title, "sm_b", tone)
        for i, line in enumerate(lines):
            c.text((tx + 14, y0 + 40 + i * 20), line, "mono_sm", TEXT_DIM)

    gy = 690
    c.text((60, gy - 22), "NON-NEGOTIABLE GUARANTEES", "xs", TEXT_MUTED)
    for i, (head, sub) in enumerate([
        ("Every request validated", "91 strict schemas"),
        ("Nothing sensitive logs", "redaction in the bus"),
        ("Writes need approval", "files, commands, exports"),
        ("Local only", "no telemetry, no cloud"),
    ]):
        bx = 60 + i * 330
        c.rect((bx, gy, bx + 310, gy + 80), fill=SURFACE_2, outline=BORDER, radius=10)
        c.dot((bx + 20, gy + 22), OK, 4)
        c.text((bx + 34, gy + 14), head, "sm_b", TEXT)
        c.text((bx + 20, gy + 48), sub, "xs", TEXT_DIM)
    c.text((60, c.h - 40), "The same dispatcher serves the desktop app and the loopback HTTP API.", "sm", TEXT_MUTED)


SCENES = [
    ("hero.png", hero),
    ("01-overview.png", overview),
    ("02-run-wizard.png", run_wizard),
    ("03-run-detail.png", run_detail),
    ("04-projects.png", projects),
    ("05-agents.png", agents),
    ("06-integrations.png", integrations),
    ("07-evaluation.png", evaluation),
    ("08-observability.png", observability),
    ("09-terminal.png", terminal),
    ("10-rebuild.png", rebuild),
    ("11-settings.png", settings),
    ("12-modules.png", modules),
    ("13-architecture.png", architecture),
]


def build():
    for name, fn in SCENES:
        make_still(name, fn, W, H)
    print(f"rendered {len(SCENES)} stills into docs/images")


if __name__ == "__main__":
    build()
