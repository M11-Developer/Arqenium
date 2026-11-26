#!/usr/bin/env python3
"""
ARQENIUM tutorial video renderer.

Each episode is a sequence of beats. A beat draws one UI state; the renderer
animates between beats (cross-fade, cursor, click ripple, numbered callouts) and
holds long enough to read. Output goes to docs/video/*.mp4.

If a narration track exists at docs/video/audio/<slug>.mp3 (or .m4a/.wav) it is
mixed in automatically; otherwise the episode renders silently. Beat durations
are stretched to at least the narration length so audio and picture agree.

    python3 docs/tools/videos.py            # all episodes
    python3 docs/tools/videos.py 03         # one episode
"""
from __future__ import annotations

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image  # noqa: E402

from render import (  # noqa: E402
    ACCENT, ACCENT_SOFT, BG, BORDER, ERR, IMAGES, INFO, OK, PURPLE, SURFACE,
    SURFACE_2, SURFACE_3, TEXT, TEXT_DIM, TEXT_MUTED, VIDEO, WARN, Canvas,
    VideoWriter, ffmpeg_bin, font, footer, header, sidebar, window,
)

W, H = 1440, 800
FPS = 30
AUDIO_DIR = os.path.join(VIDEO, "audio")


# --------------------------------------------------------------------------
# chrome + animation helpers
# --------------------------------------------------------------------------
def base(active, title, subtitle, actions=()):
    c = Canvas(W, H)
    window(c)
    w = sidebar(c, active)
    y = header(c, w, title, subtitle, actions)
    footer(c)
    return c, w, y


def cursor(c: Canvas, xy, click=0.0, label=None):
    x, y = xy
    c.last_cursor = (x, y)
    if click > 0:
        r = 12 + 34 * click
        alpha = max(0.0, 1 - click)
        col = tuple(int(BG[i] + (ACCENT[i] - BG[i]) * alpha) for i in range(3))
        c.d.ellipse((x - r, y - r, x + r, y + r), outline=col, width=3)
    poly = [(x, y), (x, y + 17), (x + 4.5, y + 12.5), (x + 8, y + 19), (x + 11, y + 17.5), (x + 7.5, y + 11), (x + 13, y + 10.5)]
    c.d.polygon([(px + 1.5, py + 2) for px, py in poly], fill=(6, 8, 10))
    c.d.polygon(poly, fill=(245, 248, 251))
    if label:
        fw = c.measure(label, "xs") + 16
        ly = y + 28
        c.rect((x + 14, ly, x + 14 + fw, ly + 22), fill=ACCENT, radius=6)
        c.text((x + 22, ly + 11), label, "xs", (8, 12, 16), anchor="lm")


def toast(c: Canvas, message, tone="ok", y=None):
    # Default to just above the stage bar so it never covers page actions.
    if y is None:
        y = H - 34 - 92 - 58
    col = {"ok": OK, "err": ERR, "info": ACCENT, "warn": WARN}[tone]
    tw = c.measure(message, "sm_b") + 56
    x1, x0 = W - 44, W - 44 - tw
    c.rect((x0, y, x1, y + 44), fill=(22, 26, 33), outline=col, radius=10)
    c.dot((x0 + 20, y + 22), col, 5)
    c.text((x0 + 36, y + 22), message, "sm_b", TEXT, anchor="lm")


def stage(c: Canvas, step, title, sub=None):
    top = H - 34 - 92
    c.rect((0, top, W, H - 34), fill=(15, 18, 23))
    c.d.line([(0, top), (W, top)], fill=BORDER)
    c.rect((28, top + 24, 62, top + 58), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((45, top + 41), str(step), "sm_b", ACCENT, anchor="mm")
    c.text((78, top + 24), title, "h3", TEXT)
    if sub:
        c.text((78, top + 50), sub, "sm", TEXT_DIM)


def hl(c: Canvas, box, tone=ACCENT, width=3):
    c.rect(box, outline=tone, width=width, radius=12)


def marker(c: Canvas, box, n, tone=ACCENT):
    c.rect(box, outline=tone, width=3, radius=12)
    cx, cy = box[2] - 14, box[1] + 4
    c.d.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=tone, outline=BG, width=3)
    c.text((cx, cy), str(n), "sm_b", (10, 12, 16), anchor="mm")


# --------------------------------------------------------------------------
# EPISODE 1 — install, launch, tour the shell
# --------------------------------------------------------------------------
def ep1():
    out = []

    c = Canvas(W, H)
    c.rect((0, 0, W, H), fill=(9, 11, 14))
    c.rect((0, 0, W, 36), fill=(16, 19, 24))
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        c.dot((22 + i * 18, 18), col, 5)
    c.text((W / 2, 18), "Terminal — arqenium", "sm", TEXT_MUTED, anchor="mm")
    lines = [
        ("$ git clone https://github.com/M11-Developer/Arqenium.git", TEXT),
        ("$ cd Arqenium", TEXT),
        ("$ npm install", TEXT),
        ("added 622 packages in 12s", TEXT_MUTED),
        ("$ npm run dev", TEXT),
        ("", TEXT),
        ("  ARQENIUM development runtime", ACCENT),
        ("  Web UI        http://localhost:5173", TEXT_DIM),
        ("  Local API     http://127.0.0.1:4319", TEXT_DIM),
        ("", TEXT),
        ("[api]  API listening on http://127.0.0.1:4319", OK),
        ("[vite] ready in 316 ms", OK),
    ]
    for i, (line, tone) in enumerate(lines):
        c.text((40, 84 + i * 30), line, "mono", tone)
    stage(c, 1, "Install and launch", "two commands · no cloud account · nothing to sign up for")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("overview", "Welcome to ARQENIUM", "A local engineering command center", [("Add project", "primary")])
    c.panel((w + 28, y, w + 700, y + 300))
    c.text((w + 48, y + 18), "Start here", "h2", TEXT)
    for i, (head, sub) in enumerate([
        ("Add a project", "Point at a local repository. Indexing runs immediately."),
        ("Create an agent", "Role, tools, permissions, limits — per agent."),
        ("Compose a run", "Chain tasks across agents with dependency ordering."),
        ("Watch it happen", "Every event streams into TraceX live."),
    ]):
        yy = y + 72 + i * 52
        c.dot((w + 56, yy + 8), ACCENT if i == 0 else SURFACE_3, 8)
        c.text((w + 80, yy - 2), head, "sm_b", TEXT)
        c.text((w + 80, yy + 18), sub, "xs", TEXT_DIM)
    hl(c, (w + 28, y, w + 700, y + 300))
    c.panel((w + 716, y, W - 28, y + 300))
    c.text((w + 736, y + 18), "What stays local", "h2", TEXT)
    for i, (k, v) in enumerate([
        ("Data", "~/.local/share/arqenium"),
        ("Database", "SQLite, WAL mode"),
        ("Network", "loopback only"),
        ("Telemetry", "none, ever"),
    ]):
        c.text((w + 736, y + 68 + i * 44), k, "xs", TEXT_MUTED)
        c.text((w + 736, y + 86 + i * 44), v, "mono", TEXT_DIM)
    cursor(c, (w + 596, y + 20), 0.35, "1. Add project")
    stage(c, 2, "The shell", "sidebar destinations · page actions top-right · live status in the footer")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("overview", "Eleven destinations", "Each sidebar entry maps to a module")
    for i, (name, desc) in enumerate([
        ("Overview", "health, activity, next action"),
        ("Runs", "create, watch, approve, cancel"),
        ("Projects", "tree, code, symbols, graph, impact"),
        ("Agents", "roles, tools, permissions"),
        ("Integrations", "MCP servers and tool policy"),
        ("Evaluation", "suites, runs, exports"),
        ("Observability", "TraceX event stream"),
        ("Terminal", "EchoShell with approvals"),
        ("Rebuild", "screenshot → measured code"),
        ("Modules", "enable optional capabilities"),
        ("Settings", "providers, context, credentials"),
    ]):
        yy = 112 + i * 34
        if i == 2:
            hl(c, (8, yy - 8, 226, yy + 26))
        c.text((250, yy + 4), f"{name}  —  {desc}", "sm", TEXT if i == 2 else TEXT_DIM)
    c.panel((w + 28, y, W - 28, y + 150))
    c.text((w + 46, y + 14), "Tip", "h3", TEXT)
    c.text((w + 46, y + 44), "Every page has an empty state that tells you the next step.", "sm", TEXT_DIM)
    c.text((w + 46, y + 68), "Nothing in the UI is a placeholder: each control maps to a validated channel.", "sm", TEXT_DIM)
    cursor(c, (120, 182), 0.2, None)
    stage(c, 3, "Navigation", "eleven routes in a hash router — no page reloads")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("observability", "Observability", "TraceX — every event, tool call and decision")
    c.panel((w + 28, y, W - 28, y + 380))
    c.text((w + 48, y + 14), "Event stream", "h3", TEXT)
    for i, (kind, msg, tone) in enumerate([
        ("run.completed", "Release check finished — 8/8 tasks", OK),
        ("task.completed", "Reviewer finished review of router.ts", OK),
        ("tool.call", "search_symbols · 12 results · 34 ms", INFO),
        ("approval.approved", "write_file src/lib/router.ts by you", WARN),
        ("project.indexed", "9 files · 36 symbols · 10 edges", ACCENT),
    ]):
        yy = y + 56 + i * 60
        c.rect((w + 46, yy, W - 46, yy + 48), fill=SURFACE_2, outline=BORDER, radius=8)
        c.dot((w + 64, yy + 24), tone, 4)
        c.text((w + 80, yy + 8), kind, "mono_sm", tone)
        c.text((w + 80, yy + 26), msg, "xs", TEXT_DIM)
        c.text((W - 70, yy + 24), f"{i + 3} ms", "xs", TEXT_MUTED, anchor="rm")
    footer(c, "Live · SSE connected · 0 errors")
    stage(c, 4, "Live data", "the footer shows whether the stream is healthy")
    out.append((c.img, getattr(c, 'last_cursor', None)))
    return out


# --------------------------------------------------------------------------
# EPISODE 2 — projects
# --------------------------------------------------------------------------
def ep2():
    out = []

    c, w, y = base("projects", "Projects", "Local repositories, indexed with real parsers", [("Add project", "primary")])
    c.rect((w + 200, y + 50, w + 900, y + 380), fill=SURFACE, outline=BORDER, radius=14)
    c.text((w + 224, y + 70), "Add a project", "h2", TEXT)
    c.text((w + 224, y + 106), "Folder path", "xs", TEXT_MUTED)
    c.rect((w + 224, y + 124, w + 850, y + 162), fill=SURFACE_3, outline=ACCENT, radius=8)
    c.text((w + 240, y + 143), "/home/you/code/fixture-app", "mono", TEXT, anchor="lm")
    c.text((w + 224, y + 176), "Everything stays on this machine. Paths outside the root are refused.", "xs", TEXT_MUTED)
    c.rect((w + 224, y + 212, w + 400, y + 248), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 312, y + 230), "Choose folder…", "sm_b", ACCENT, anchor="mm")
    c.rect((w + 412, y + 212, w + 560, y + 248), fill=SURFACE_2, outline=BORDER, radius=8)
    c.text((w + 486, y + 230), "Index now", "sm_b", TEXT_DIM, anchor="mm")
    cursor(c, (w + 480, y + 230), 0.3, "Add")
    stage(c, 1, "Add a project", "native folder picker in Electron · typed path in the browser")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("projects", "Projects", "Indexing fixture-app …", [("Add project", "primary")])
    c.panel((w + 28, y, W - 28, y + 180))
    c.text((w + 48, y + 16), "fixture-app", "h2", TEXT)
    c.text((w + 48, y + 50), "scanning src/ … 7 of 9 files", "sm", TEXT_DIM)
    c.bar((w + 48, y + 78, W - 68, y + 90), 0.72, ACCENT)
    for i, (k, v) in enumerate([("TypeScript", "5 files"), ("Python", "1 file"), ("Other", "3 files")]):
        c.text((w + 48 + i * 200, y + 108), k, "xs", TEXT_MUTED)
        c.text((w + 48 + i * 200, y + 126), v, "mono", TEXT_DIM)
    stage(c, 2, "Indexing", "TypeScript via the compiler API · Python in a sandboxed child process")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("projects", "Projects", "Indexed in 73 ms", [("Reindex", "ghost"), ("Add project", "primary")])
    c.panel((w + 28, y, w + 340, y + 440))
    c.text((w + 48, y + 14), "fixture-app", "h3", TEXT)
    c.bar((w + 48, y + 42, w + 320, y + 48), 1.0, OK)
    c.text((w + 48, y + 56), "9 files · 36 symbols · 10 edges", "xs", TEXT_DIM)
    for i, (name, depth) in enumerate([("src", 0), ("index.ts", 1), ("service.py", 1), ("lib", 1), ("router.ts", 2),
                                       ("config.ts", 2), ("format.ts", 2), ("tests", 0), ("README.md", 0)]):
        yy = y + 88 + i * 28
        if name == "router.ts":
            c.rect((w + 38, yy - 4, w + 332, yy + 20), fill=SURFACE_3, radius=6)
        c.text((w + 48 + depth * 16, yy), name, "sm", TEXT if depth == 0 else TEXT_DIM)
    c.panel((w + 356, y, W - 28, y + 440))
    c.text((w + 376, y + 14), "src/lib/router.ts", "h3", TEXT)
    c.chip((W - 260, y + 12), "3 symbols", "ok", "xs")
    for i, line in enumerate([
        "export interface Route { path: string }",
        "",
        "export interface Router {",
        "  match(path: string): Route | null",
        "}",
        "",
        "export function createRouter(routes: Route[]): Router {",
        "  const table = new Map(routes.map((r) => [r.path, r]))",
        "  return { match: (p) => table.get(p) ?? null }",
        "}",
    ]):
        c.text((w + 376, y + 54 + i * 24), line, "mono", ACCENT if line.startswith("export") else TEXT_DIM)
    toast(c, "Indexed 9 files in 73 ms")
    stage(c, 3, "Explore", "tree, source and symbols all come from disk — no bundler, no language server")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("projects", "Projects", "Impact analysis", [("Reindex", "ghost")])
    c.panel((w + 28, y, w + 500, y + 330))
    c.text((w + 48, y + 14), "If I change src/lib/format.ts", "h3", TEXT)
    for i, (p, depth, conf) in enumerate([
        ("src/lib/router.ts", 1, "parsed"),
        ("src/index.ts", 2, "parsed"),
        ("tests/router.test.ts", 2, "heuristic"),
    ]):
        yy = y + 58 + i * 62
        c.rect((w + 48, yy, w + 480, yy + 50), fill=SURFACE_2, outline=BORDER, radius=8)
        c.text((w + 64, yy + 8), p, "mono", TEXT)
        c.chip((w + 64, yy + 26), f"depth {depth}", "accent", "xs")
        c.chip((w + 148, yy + 26), conf, "ok" if conf == "parsed" else "warn", "xs")
    c.panel((w + 516, y, W - 28, y + 330))
    c.text((w + 536, y + 14), "Dependency graph", "h3", TEXT)
    nodes = {"index": (w + 660, y + 90), "router": (w + 790, y + 150), "format": (w + 660, y + 220), "test": (w + 900, y + 240)}
    for a, b in [("index", "router"), ("router", "format"), ("test", "router")]:
        c.arrow(nodes[a], nodes[b], (70, 90, 110), 2)
    for name, (nx, ny) in nodes.items():
        c.d.ellipse((nx - 34, ny - 34, nx + 34, ny + 34), fill=SURFACE_2, outline=ACCENT, width=2)
        c.text((nx, ny), name, "xs", ACCENT, anchor="mm")
    stage(c, 4, "Impact analysis", "parsed edges and heuristic test matches are labelled differently, never merged")
    out.append((c.img, getattr(c, 'last_cursor', None)))
    return out


# --------------------------------------------------------------------------
# EPISODE 3 — agents + permissions
# --------------------------------------------------------------------------
def ep3():
    out = []

    c, w, y = base("agents", "Agents", "Role, tools, permissions and limits", [("New agent", "primary")])

    def card(i, name, role, tools, tone):
        bx = w + 28 + (i % 3) * 372
        by = y + (i // 3) * 196
        c.panel((bx, by, bx + 352, by + 178))
        c.rect((bx, by, bx + 352, by + 4), fill=tone, radius=2)
        c.text((bx + 18, by + 18), name, "h3", TEXT)
        c.chip((bx + 18, by + 48), role, "neutral", "xs")
        c.text((bx + 18, by + 86), tools, "sm", TEXT_DIM)
        c.rect((bx + 18, by + 142, bx + 110, by + 168), fill=SURFACE_3, outline=BORDER, radius=6)
        c.text((bx + 64, by + 155), "Configure", "xs", TEXT_DIM, anchor="mm")
        c.rect((bx + 118, by + 142, bx + 186, by + 168), fill=SURFACE_3, outline=BORDER, radius=6)
        c.text((bx + 152, by + 155), "Delete", "xs", ERR, anchor="mm")

    card(0, "Planner", "Strategist", "6 tools · read-only", ACCENT)
    card(1, "Implementer", "Builder", "5 tools · may write", OK)
    card(2, "Reviewer", "Critic", "4 tools · read-only", INFO)
    stage(c, 1, "Agent library", "an agent is a configuration: role, prompt, tools, permissions, limits")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("agents", "Agents", "Role, tools, permissions and limits")
    c.rect((0, 36, W, H - 34), fill=(6, 8, 11))
    c.rect((w + 300, y + 20, w + 980, y + 520), fill=(20, 24, 30), outline=BORDER, radius=14)
    c.text((w + 326, y + 40), "New agent", "h2", TEXT)
    c.text((w + 326, y + 76), "Start from a role template", "xs", TEXT_MUTED)
    for i, (r, sub) in enumerate([("Planner", "decompose"), ("Implementer", "produce changes"), ("Reviewer", "verify"), ("Tester", "run checks")]):
        rx = w + 326 + (i % 2) * 320
        ry = y + 100 + (i // 2) * 72
        c.rect((rx, ry, rx + 300, ry + 60), fill=SURFACE_2, outline=ACCENT if i == 1 else BORDER, radius=9)
        c.text((rx + 14, ry + 9), r, "sm_b", TEXT)
        c.text((rx + 14, ry + 32), sub, "xs", TEXT_DIM)
    for i, (k, v) in enumerate([("Name", "Data pipeline implementer"), ("Model", "Demo provider (no model)"), ("Max iterations", "8")]):
        fy = y + 258 + i * 56
        c.text((w + 326, fy), k, "xs", TEXT_MUTED)
        c.rect((w + 326, fy + 18, w + 950, fy + 50), fill=SURFACE_3, outline=BORDER, radius=8)
        c.text((w + 340, fy + 34), v, "mono_sm", TEXT_DIM, anchor="lm")
    c.rect((w + 760, y + 450, w + 950, y + 490), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 855, y + 470), "Create agent", "sm_b", ACCENT, anchor="mm")
    cursor(c, (w + 855, y + 470), 0.45, "Create")
    stage(c, 2, "Create an agent", "templates pre-fill the tool set and the permission flags")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("agents", "Implementer", "Tools and permission flags")
    c.panel((w + 28, y, w + 700, y + 400))
    c.text((w + 48, y + 14), "Tools granted", "h3", TEXT)
    for i, (t, on) in enumerate([("project_structure", True), ("search_symbols", True), ("read_file", True), ("write_file", True), ("run_command", False)]):
        yy = y + 54 + i * 46
        c.text((w + 48, yy), t, "mono", TEXT_DIM if on else TEXT_MUTED)
        c.rect((w + 400, yy - 4, w + 448, yy + 20), fill=ACCENT_SOFT if on else SURFACE_3, radius=99)
        c.d.ellipse((w + 426 if on else w + 404, yy, w + 442 if on else w + 420, yy + 16), fill=ACCENT if on else TEXT_MUTED)
        if not on:
            c.text((w + 462, yy + 2), "needs EchoShell", "xs", WARN)
    c.panel((w + 716, y, W - 28, y + 400))
    c.text((w + 736, y + 14), "Permissions", "h3", TEXT)
    for i, (k, on, sub) in enumerate([
        ("canReadFiles", True, "read anything inside the root"),
        ("canWriteFiles", True, "always prompts for approval"),
        ("canRunCommands", False, "off — EchoShell is disabled"),
        ("autoApprove", False, "empty — nothing skips the prompt"),
    ]):
        yy = y + 58 + i * 80
        c.text((w + 736, yy), k, "mono", ACCENT if on else TEXT_MUTED)
        c.text((w + 736, yy + 22), sub, "xs", TEXT_DIM)
        c.chip((W - 160, yy - 2), "on" if on else "off", "ok" if on else "neutral", "xs")
    hl(c, (w + 716, y, W - 28, y + 400), WARN)
    stage(c, 3, "Least privilege", "writes and commands always require an approval record")
    out.append((c.img, getattr(c, 'last_cursor', None)))
    return out


# --------------------------------------------------------------------------
# EPISODE 4 — build and run a pipeline
# --------------------------------------------------------------------------
def ep4():
    out = []

    def rows(c, w, y, n):
        for i in range(n):
            data = [("Plan the change", "Planner", None), ("Implement the change", "Implementer", "after task 1"), ("Review the diff", "Reviewer", "after task 2")]
            title, role, dep = data[i]
            yy = y + 50 + i * 84
            c.rect((w + 46, yy, w + 862, yy + 74), fill=SURFACE_2, outline=BORDER, radius=10)
            c.text((w + 66, yy + 12), title, "sm_b", TEXT)
            cx = c.chip((w + 66, yy + 34), role, "accent", "xs") + 8
            cx = c.chip((cx, yy + 34), "demo", "neutral", "xs") + 8
            if dep:
                c.chip((cx, yy + 34), dep, "purple", "xs")
            c.text((w + 66, yy + 56), "priority 50 · max 1 attempt", "xs", TEXT_MUTED)

    c, w, y = base("runs", "New run", "Compose a pipeline", [("Create run", "primary")])
    c.panel((w + 28, y, w + 880, y + 300))
    c.text((w + 46, y + 14), "Tasks", "h3", TEXT)
    rows(c, w, y, 2)
    c.rect((w + 46, y + 220, w + 862, y + 264), fill=SURFACE_2, outline=BORDER, radius=10)
    c.text((w + 400, y + 242), "+ Add task", "sm_b", TEXT_DIM, anchor="mm")
    cursor(c, (w + 400, y + 242), 0.35, "Add task")
    stage(c, 1, "Compose tasks", "each task names its agent, its dependencies and its retry policy")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("runs", "New run", "Compose a pipeline", [("Create run", "primary")])
    c.panel((w + 28, y, w + 880, y + 190))
    c.text((w + 46, y + 14), "Budget & mode", "h3", TEXT)
    c.text((w + 46, y + 42), "Mode", "xs", TEXT_MUTED)
    c.chip((w + 46, y + 58), "Demo (no model needed)", "accent", "xs")
    c.chip((w + 236, y + 58), "Live (needs a provider)", "neutral", "xs")
    c.text((w + 46, y + 88), "Budgets", "xs", TEXT_MUTED)
    for i, (k, v, pct) in enumerate([("Max duration", "10 min", 0.32), ("Max tool calls", "60", 0.2), ("Max tokens", "400k", 0.12)]):
        bx = w + 46 + i * 260
        c.text((bx, y + 108), k, "xs", TEXT_MUTED)
        c.text((bx, y + 126), v, "sm_b", TEXT)
        c.bar((bx, y + 150, bx + 210, y + 158), pct, ACCENT)
    c.text((w + 46, y + 174), "A run that exceeds a budget fails, with the reason recorded in TraceX.", "xs", TEXT_MUTED)
    c.panel((w + 896, y, W - 28, y + 190))
    c.text((w + 916, y + 14), "Estimated", "h3", TEXT)
    c.text((w + 916, y + 50), "3 tasks · 2 tool calls · ~8 s", "sm", TEXT_DIM)
    c.text((w + 916, y + 78), "Cost $0.00 (demo)", "sm", OK)
    hl(c, (w + 28, y, w + 880, y + 190))
    cursor(c, (w + 640, y + 155), 0.2, None)
    stage(c, 2, "Set budgets", "hard limits, not suggestions")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("runs", "Release check", "run_9dd12b1d · running", [("Cancel run", "ghost")])
    c.chip((w + 28, y - 6), "running", "accent", "xs")
    c.bar((w + 28, y + 22, w + 400, y + 30), 0.55, ACCENT)
    c.text((w + 414, y + 20), "1 of 2 tasks", "xs", TEXT_MUTED)
    c.panel((w + 28, y + 54, w + 700, y + 400))
    c.text((w + 48, y + 68), "Task timeline", "h3", TEXT)
    for i, (title, status) in enumerate([("Plan the change", "completed"), ("Implement the change", "running")]):
        yy = y + 108 + i * 128
        c.rect((w + 48, yy, w + 680, yy + 110), fill=SURFACE_2, outline=ACCENT if status == "running" else BORDER, radius=10)
        c.text((w + 66, yy + 12), title, "sm_b", TEXT)
        c.chip((w + 66, yy + 38), status, "ok" if status == "completed" else "accent", "xs")
        c.text((w + 66, yy + 70), "tool.call → search_symbols" if i == 1 else "output recorded", "mono_sm", TEXT_MUTED)
    c.panel((w + 716, y + 54, W - 28, y + 400))
    c.text((w + 736, y + 68), "Live TraceX", "h3", TEXT)
    for i, (e, tone) in enumerate([("run.started", OK), ("task.started", INFO), ("tool.call", ACCENT), ("task.completed", OK)]):
        yy = y + 108 + i * 42
        c.dot((w + 742, yy + 6), tone, 4)
        c.text((w + 758, yy), e, "mono_sm", tone)
    stage(c, 3, "Watch it run", "progress arrives over one SSE stream — no polling, no refresh")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("runs", "Release check", "run_9dd12b1d · completed")
    c.chip((w + 28, y - 6), "completed", "ok", "xs")
    c.text((w + 130, y), "2 tasks · 2 completed · 0 failed · 13 ms", "xs", TEXT_MUTED)
    c.panel((w + 28, y + 34, w + 700, y + 360))
    for i, title in enumerate(["Plan the change", "Implement the change"]):
        yy = y + 60 + i * 128
        c.rect((w + 48, yy, w + 680, yy + 110), fill=SURFACE_2, outline=BORDER, radius=10)
        c.text((w + 66, yy + 12), title, "sm_b", TEXT)
        c.chip((w + 66, yy + 38), "completed", "ok", "xs")
        c.rect((w + 66, yy + 68, w + 660, yy + 96), fill=(13, 15, 19), radius=6)
        c.text((w + 80, yy + 82), "Demo agent output (sample data — not generated by a real model).", "mono_sm", TEXT_DIM, anchor="lm")
    c.panel((w + 716, y + 34, W - 28, y + 360))
    c.text((w + 736, y + 48), "Approvals", "h3", TEXT)
    c.rect((w + 736, y + 84, W - 46, y + 196), fill=(26, 30, 38), outline=WARN, radius=10)
    c.text((w + 754, y + 96), "write_file · pending", "sm_b", WARN)
    c.text((w + 754, y + 120), "src/lib/router.ts", "mono_sm", TEXT_DIM)
    c.rect((w + 754, y + 148, w + 872, y + 180), fill=ACCENT_SOFT, outline=ACCENT, radius=7)
    c.text((w + 813, y + 164), "Approve", "sm_b", ACCENT, anchor="mm")
    c.rect((w + 884, y + 148, w + 1000, y + 180), fill=SURFACE_3, outline=BORDER, radius=7)
    c.text((w + 942, y + 164), "Deny", "sm_b", TEXT_DIM, anchor="mm")
    c.text((w + 754, y + 210), "Deny → the tool returns denied and the agent is told not to retry.", "xs", TEXT_DIM)
    c.text((w + 754, y + 232), "Approve → the write happens and is recorded against your name.", "xs", OK)
    toast(c, "Run completed — 2/2 tasks")
    hl(c, (w + 736, y + 84, W - 46, y + 196), WARN)
    cursor(c, (w + 813, y + 164), 0.5, "Approve")
    stage(c, 4, "Approve the writes", "the agent is paused until you decide — denials are honoured, not retried")
    out.append((c.img, getattr(c, 'last_cursor', None)))
    return out


# --------------------------------------------------------------------------
# EPISODE 5 — the remaining surfaces
# --------------------------------------------------------------------------
def ep5():
    out = []

    c, w, y = base("integrations", "Integrations", "MCP servers and tool policy", [("Add server", "primary")])
    c.panel((w + 28, y, w + 520, y + 250))
    c.text((w + 46, y + 14), "Registered servers", "h3", TEXT)
    for i, (name, tr, st, tone) in enumerate([
        ("ARQENIUM internal", "http · 127.0.0.1:4321", "connected", OK),
        ("filesystem", "stdio · npx", "connected", OK),
        ("github", "http · api.github.com", "disconnected", TEXT_MUTED),
    ]):
        yy = y + 50 + i * 66
        c.rect((w + 46, yy, w + 502, yy + 54), fill=SURFACE_2, outline=BORDER, radius=9)
        c.dot((w + 62, yy + 18), tone, 5)
        c.text((w + 78, yy + 10), name, "sm_b", TEXT)
        c.text((w + 78, yy + 30), tr, "mono_sm", TEXT_MUTED)
        c.chip((w + 380, yy + 10), st, "ok" if tone == OK else "neutral", "xs")
    c.panel((w + 536, y, W - 28, y + 250))
    c.text((w + 554, y + 14), "Tool policy", "h3", TEXT)
    for i, (t, allowed, auto) in enumerate([("project_structure", True, False), ("search_symbols", True, True), ("read_file", True, False), ("evaluation_run", False, False)]):
        yy = y + 52 + i * 36
        c.text((w + 554, yy), t, "mono", TEXT_DIM if allowed else TEXT_MUTED)
        c.chip((w + 760, yy - 5), "allowed" if allowed else "denied", "ok" if allowed else "err", "xs")
        if allowed:
            c.chip((w + 856, yy - 5), "auto" if auto else "ask", "accent" if auto else "warn", "xs")
    c.panel((w + 28, y + 266, W - 28, y + 452))
    c.text((w + 46, y + 280), "Tool call", "h3", TEXT)
    c.rect((w + 46, y + 312, W - 46, y + 424), fill=(13, 15, 19), radius=8)
    for i, line in enumerate([
        '{ "ok": true, "durationMs": 4 }',
        '{ "total": 2, "symbols": [',
        '    { "name": "parse_records", "path": "src/service.py" } ] }',
    ]):
        c.text((w + 62, y + 326 + i * 22), line, "mono_sm", OK if i == 0 else TEXT_DIM)
    toast(c, "MCP round trip verified over Streamable HTTP")
    stage(c, 1, "Integrations", "allow / deny / auto-approve, per tool and per server — default is deny")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("evaluation", "Evaluation lab", "Reproducible suites", [("Run suite", "primary")])
    c.panel((w + 28, y, w + 380, y + 400))
    c.text((w + 46, y + 14), "Suites", "h3", TEXT)
    for i, (name, kind, score, tone) in enumerate([
        ("Fixture project integrity", "deterministic", "3/3", OK),
        ("Project index checks", "deterministic", "2/2", OK),
        ("Agent engineering tasks", "ai-judged", "2/2", OK),
    ]):
        yy = y + 52 + i * 88
        c.rect((w + 46, yy, w + 362, yy + 74), fill=SURFACE_2, outline=ACCENT if i == 0 else BORDER, radius=10)
        c.text((w + 62, yy + 10), name, "sm_b", TEXT)
        c.chip((w + 62, yy + 38), kind, "accent" if kind == "ai-judged" else "neutral", "xs")
        c.text((w + 344, yy + 18), score, "sm_b", tone, anchor="ra")
    c.panel((w + 396, y, W - 28, y + 400))
    c.text((w + 414, y + 14), "Results", "h3", TEXT)
    for i, (name, detail) in enumerate([
        ("Entrypoint declares routes", "3 markers · 44 lines"),
        ("Service exports parser", "3 markers · 38 lines"),
        ("Operation log has no secrets", "28 events, 0 leaks"),
    ]):
        yy = y + 58 + i * 64
        c.chip((w + 414, yy), "pass", "ok", "xs")
        c.text((w + 482, yy + 5), name, "sm", TEXT_DIM)
        c.text((W - 46, yy + 6), detail, "xs", TEXT_MUTED, anchor="ra")
    c.rect((w + 414, y + 256, w + 550, y + 292), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 482, y + 274), "Copy JSON", "sm_b", ACCENT, anchor="mm")
    c.rect((w + 562, y + 256, w + 700, y + 292), fill=SURFACE_2, outline=BORDER, radius=8)
    c.text((w + 631, y + 274), "Download CSV", "sm_b", TEXT_DIM, anchor="mm")
    cursor(c, (w + 482, y + 274), 0.45, "Export")
    stage(c, 2, "Evaluation", "objective checks first; model judgment is recorded separately")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("terminal", "Terminal", "EchoShell — preview, approve, execute", [("New session", "primary")])
    c.panel((w + 28, y, W - 28, y + 190))
    c.text((w + 46, y + 14), "Command preview", "h3", TEXT)
    c.rect((w + 46, y + 46, W - 46, y + 84), fill=(13, 15, 19), outline=BORDER, radius=8)
    c.text((w + 62, y + 65), "$ ls -la src", "mono", TEXT, anchor="lm")
    c.chip((W - 300, y + 54), "risk: low", "ok", "xs")
    c.text((w + 46, y + 98), 'argv ["ls","-la","src"] · cwd = project root · shell disabled', "xs", TEXT_MUTED)
    c.rect((w + 46, y + 126, w + 210, y + 164), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 128, y + 145), "Approve & run", "sm_b", ACCENT, anchor="mm")
    c.panel((w + 28, y + 206, W - 28, y + 452))
    c.text((w + 46, y + 220), "Output", "h3", TEXT)
    c.chip((W - 320, y + 218), "exit 0", "ok", "xs")
    for i, line in enumerate(["drwxr-xr-x  index.ts      1.2k", "drwxr-xr-x  service.py    0.9k", "drwxr-xr-x  lib/          4 entries"]):
        c.text((w + 46, y + 258 + i * 22), line, "mono_sm", TEXT_DIM)
    c.text((w + 46, y + 348), "Blocked examples", "xs", TEXT_MUTED)
    for i, (cmd, why) in enumerate([("rm -rf /", "blocked: recursive root delete"), ("ls | wc -l", "rejected: no shell operators")]):
        yy = y + 372 + i * 28
        c.text((w + 46, yy), cmd, "mono", ERR)
        c.text((w + 320, yy), why, "xs", TEXT_DIM)
    cursor(c, (w + 128, y + 145), 0.4, "Approve")
    stage(c, 3, "EchoShell", "no shell interpolation · blocked commands stay blocked even when approved")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("rebuild", "Rebuild Studio", "Screenshot → measured reconstruction", [("Capture", "primary")])
    c.panel((w + 28, y, w + 440, y + 370))
    c.text((w + 46, y + 14), "Reference", "h3", TEXT)
    c.rect((w + 46, y + 48, w + 422, y + 240), fill=(13, 15, 19), outline=BORDER, radius=8)
    c.rect((w + 46, y + 48, w + 422, y + 86), fill=(26, 31, 39), radius=8)
    c.rect((w + 60, y + 60, w + 120, y + 74), fill=ACCENT, radius=4)
    c.rect((w + 46, y + 106, w + 422, y + 132), fill=(232, 236, 241), radius=4)
    c.rect((w + 46, y + 190, w + 180, y + 220), fill=ACCENT, radius=6)
    c.text((w + 46, y + 258), "640 × 400 · PNG", "xs", TEXT_MUTED)
    for i, col in enumerate([(12, 12, 16), (24, 28, 32), (60, 64, 76), (232, 236, 240)]):
        c.rect((w + 46 + i * 94, y + 282, w + 130 + i * 94, y + 314), fill=col, outline=BORDER, radius=6)
    c.panel((w + 456, y, w + 900, y + 370))
    c.text((w + 474, y + 14), "Measured", "h3", TEXT)
    for i, (k, v) in enumerate([("background", "#0c0c10"), ("text", "#e8ecf0"), ("contrast", "16.4 : 1"), ("bands", "14"), ("confidence", "low")]):
        c.text((w + 474, y + 52 + i * 44), k, "xs", TEXT_MUTED)
        c.text((w + 474, y + 70 + i * 44), v, "mono", TEXT)
    c.chip((w + 474, y + 288), "2 warnings", "warn", "xs")
    c.panel((w + 916, y, W - 28, y + 370))
    c.text((w + 934, y + 14), "Proposed files", "h3", TEXT)
    for i, (n, sz) in enumerate([("tokens.css", 351), ("index.html", 5166), ("ANALYSIS.md", 1292)]):
        yy = y + 50 + i * 38
        c.rect((w + 934, yy, W - 46, yy + 30), fill=SURFACE_2, outline=BORDER, radius=7)
        c.text((w + 946, yy + 8), n, "mono", ACCENT)
        c.text((W - 58, yy + 9), f"{sz} B", "xs", TEXT_MUTED, anchor="ra")
    c.rect((w + 934, y + 190, W - 46, y + 228), fill=ACCENT_SOFT, outline=ACCENT, radius=8)
    c.text((w + 934 + (W - 46 - w - 934) / 2, y + 209), "Write files (approval)", "sm_b", ACCENT, anchor="mm")
    stage(c, 4, "Rebuild Studio", "measured facts and inferred design tokens are kept apart — and labelled")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("modules", "Modules", "Enable optional capabilities")
    mods = [("Project intelligence", True, True), ("Agent control", True, True), ("TraceX", True, True),
            ("EchoShell", False, False), ("Rebuild Studio", False, False), ("Evaluation", True, True)]
    for i, (name, core, on) in enumerate(mods):
        bx = w + 28 + (i % 3) * 372
        by = y + (i // 3) * 170
        c.panel((bx, by, bx + 352, by + 150))
        c.text((bx + 18, by + 16), name, "h3", TEXT)
        c.chip((bx + 18, by + 44), "core" if core else "optional", "neutral" if core else "warn", "xs")
        if on:
            c.chip((bx + 90, by + 44), "enabled", "ok", "xs")
        ox = bx + 290
        c.rect((ox, by + 18, ox + 44, by + 42), fill=ACCENT_SOFT if on else SURFACE_3, radius=99)
        c.d.ellipse((ox + 24 if on else ox + 2, by + 22, ox + 40 if on else ox + 18, by + 38), fill=ACCENT if on else TEXT_MUTED)
        c.text((bx + 18, by + 88), "cannot be disabled" if core else "opt in", "xs", TEXT_MUTED if core else WARN)
    c.rect((w + 28, y + 360, W - 28, y + 414), fill=(50, 38, 16), outline=WARN, radius=10)
    c.text((w + 48, y + 372), "The gate is enforced server-side: disabled → module_disabled (HTTP 403).", "sm_b", WARN)
    cursor(c, (w + 340, y + 100), 0.4, "Enable")
    stage(c, 5, "Modules", "core modules cannot be disabled; optional ones start off")
    out.append((c.img, getattr(c, 'last_cursor', None)))

    c, w, y = base("settings", "Settings", "Providers, context, credentials, runtime")
    x = w + 28
    for i, t in enumerate(["Providers", "Project context", "Credentials", "Runtime", "Data & storage"]):
        tw = c.measure(t, "sm") + 34
        if i == 0:
            c.rect((x, y - 8, x + tw, y + 26), fill=SURFACE_3, radius=8)
        c.text((x + 17, y + 9), t, "sm_b" if i == 0 else "sm", TEXT if i == 0 else TEXT_DIM, anchor="lm")
        x += tw + 6
    c.panel((w + 28, y + 34, W - 28, y + 190))
    c.chip((w + 46, y + 50), "Demo (built in)", "accent", "xs")
    c.text((w + 190, y + 54), "no key required · labelled sample data", "xs", TEXT_MUTED)
    for i, (k, v) in enumerate([("Default model", "demo-deterministic"), ("Tool calling", "yes"), ("Streaming", "no")]):
        c.text((w + 46, y + 90 + i * 30), k, "xs", TEXT_MUTED)
        c.text((w + 190, y + 90 + i * 30), v, "mono", TEXT_DIM)
    c.rect((w + 420, y + 84, w + 600, y + 120), fill=SURFACE_2, outline=BORDER, radius=8)
    c.text((w + 510, y + 102), "Test connection", "sm_b", TEXT_DIM, anchor="mm")
    toast(c, "Demo provider: healthy (no network)")
    cursor(c, (w + 510, y + 102), 0.4, "Test")
    stage(c, 6, "Settings", "capabilities are reported honestly — no fake streaming")
    out.append((c.img, getattr(c, 'last_cursor', None)))
    return out


EPISODES = [
    ("01-install-and-tour", "Install, launch and tour the shell", ep1, 3.2),
    ("02-projects-and-intelligence", "Projects: add, index, explore, impact", ep2, 3.2),
    ("03-agents-and-permissions", "Agents, tools and the permission model", ep3, 3.4),
    ("04-create-and-run-a-pipeline", "Create a pipeline, watch it, approve it", ep4, 3.2),
    ("05-every-other-surface", "MCP, evaluation, terminal, rebuild, modules, settings", ep5, 3.0),
]


def find_audio(slug):
    for ext in ("mp3", "m4a", "wav", "aac"):
        p = os.path.join(AUDIO_DIR, f"{slug}.{ext}")
        if os.path.exists(p):
            return p
    return None


def audio_duration(path) -> float:
    out = subprocess.run([ffmpeg_bin(), "-i", path], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            hms = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = hms.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return 0.0


def pulse(img, xy, t):
    """One frame with a soft ring pulsing around the focus point (2 s cycle)."""
    from PIL import ImageDraw
    out = img.copy()
    d = ImageDraw.Draw(out, "RGBA")
    x, y = xy
    prog = t / 2.0
    r = 16 + 26 * prog
    alpha = int(110 * (1 - prog))
    col = (53, 200, 216, alpha)
    d.ellipse((x - r, y - r, x + r, y + r), outline=col, width=2)
    return out


def render_episode(slug, title, frames, hold):
    audio = find_audio(slug)
    out_path = os.path.join(VIDEO, f"{slug}.mp4")
    voice_len = audio_duration(audio) if audio else 0.0
    # Stretch holds so picture covers narration with a short tail (audio must never
    # be cut by -shortest).
    if voice_len and frames:
        transition = 4.0 / FPS * (len(frames) - 1)
        tail = 0.8
        budget = voice_len + tail - transition
        hold = max(hold, budget / len(frames))
    rec = VideoWriter(out_path, (W, H), FPS, audio=audio)
    prev = None
    for img, focus in frames:
        if prev is not None:
            for k in range(1, 5):
                rec.frame(Image.blend(prev, img, k / 5))
        # Animate a soft attention pulse so long narration holds never look frozen.
        n = max(1, int(hold * FPS))
        for i in range(n):
            rec.frame(pulse(img, focus, (i / FPS) % 2.0) if focus else img)
        prev = img
    rec.close()
    frames[0][0].save(os.path.join(IMAGES, f"video-{slug}.png"))
    dur = rec.frames / FPS
    kind = f"voiceover {voice_len:.1f}s" if audio else "silent"
    print(f"  video  {slug}.mp4  {dur:.1f}s · {kind}")


def main():
    os.makedirs(VIDEO, exist_ok=True)
    os.makedirs(IMAGES, exist_ok=True)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for slug, title, fn, hold in EPISODES:
        if only and only not in slug:
            continue
        render_episode(slug, title, fn(), hold)
    print("videos rendered into docs/video")


if __name__ == "__main__":
    main()
