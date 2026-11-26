/**
 * Sample data captured from the real core while running in demo mode
 * (`ARQ_DEMO_MODE=1`): the seeded sample project was actually indexed, the
 * demo provider actually ran a task, and these are the responses the channels
 * returned. Do not hand-edit - regenerate with
 * `node scripts/capture-preview-dataset.mjs` against a local demo server.
 *
 * Only machine-specific values (absolute paths, ids) were normalised.
 */
export const PREVIEW_DATASET: Record<string, unknown> = {
  "app.info": {
    "name": "ARQENIUM",
    "version": "1.0.0",
    "runtime": "preview",
    "dataDir": "(hosted preview - sample data)",
    "node": "v22.22.3",
    "platform": "linux-x64",
    "telemetryEnabled": false,
    "channels": [
      "agents.create",
      "agents.delete",
      "agents.get",
      "agents.list",
      "agents.templates",
      "agents.update",
      "app.health",
      "app.info",
      "approvals.decide",
      "approvals.list",
      "artifacts.list",
      "context.delete",
      "context.list",
      "context.upsert",
      "credentials.delete",
      "credentials.has",
      "credentials.list",
      "credentials.set",
      "evals.export",
      "evals.rerun",
      "evals.results",
      "evals.run",
      "evals.runs",
      "evals.suiteCreate",
      "evals.suiteDelete",
      "evals.suites",
      "mcp.add",
      "mcp.call",
      "mcp.capabilities",
      "mcp.connect",
      "mcp.directory",
      "mcp.disconnect",
      "mcp.internal.set",
      "mcp.internal.status",
      "mcp.list",
      "mcp.remove",
      "mcp.status",
      "mcp.update",
      "modules.list",
      "modules.set",
      "projects.add",
      "projects.changes",
      "projects.file",
      "projects.get",
      "projects.graph",
      "projects.impact",
      "projects.list",
      "projects.reindex",
      "projects.remove",
      "projects.search",
      "projects.stats",
      "projects.summary",
      "projects.symbols",
      "projects.tree",
      "projects.update",
      "providers.chat",
      "providers.create",
      "providers.delete",
      "providers.list",
      "providers.models",
      "providers.test",
      "providers.update",
      "rebuild.analyze",
      "rebuild.captureDelete",
      "rebuild.captureScreenshot",
      "rebuild.captureUrl",
      "rebuild.captures",
      "rebuild.exportCommit",
      "rebuild.exportPreview",
      "rebuild.generate",
      "rebuild.preview",
      "runs.cancel",
      "runs.create",
      "runs.events",
      "runs.get",
      "runs.list",
      "settings.get",
      "settings.list",
      "settings.set",
      "tasks.get",
      "terminal.execute",
      "terminal.explain",
      "terminal.history",
      "terminal.preview",
      "terminal.sessionCreate",
      "terminal.sessionDelete",
      "terminal.sessions",
      "trace.eventTypes",
      "trace.events",
      "trace.summary",
      "trace.toolCalls"
    ],
    "capabilities": {
      "runtime": "web",
      "supportsIpc": false,
      "supportsNativeDialogs": false,
      "supportsWindowControls": false,
      "supportsAutoUpdate": false,
      "supportsEventStream": true
    },
    "modules": [
      {
        "id": "agent-control",
        "enabled": true,
        "core": true
      },
      {
        "id": "project-intelligence",
        "enabled": true,
        "core": true
      },
      {
        "id": "openbridge",
        "enabled": true,
        "core": true
      },
      {
        "id": "tracex",
        "enabled": true,
        "core": true
      },
      {
        "id": "evaluation",
        "enabled": true,
        "core": true
      },
      {
        "id": "providers",
        "enabled": true,
        "core": true
      },
      {
        "id": "shared-context",
        "enabled": true,
        "core": true
      },
      {
        "id": "echoshell",
        "enabled": true,
        "core": false
      },
      {
        "id": "rebuild-studio",
        "enabled": true,
        "core": false
      }
    ]
  },
  "app.health": {
    "ok": true,
    "version": "1.0.0",
    "runtime": "web",
    "uptimeSec": 3,
    "modules": [
      {
        "id": "agent-control",
        "enabled": true
      },
      {
        "id": "project-intelligence",
        "enabled": true
      },
      {
        "id": "openbridge",
        "enabled": true
      },
      {
        "id": "tracex",
        "enabled": true
      },
      {
        "id": "evaluation",
        "enabled": true
      },
      {
        "id": "providers",
        "enabled": true
      },
      {
        "id": "shared-context",
        "enabled": true
      },
      {
        "id": "echoshell",
        "enabled": true
      },
      {
        "id": "rebuild-studio",
        "enabled": true
      }
    ],
    "projects": 1,
    "providers": [
      {
        "id": "prov_86ae14c35a774f8b803b",
        "kind": "demo",
        "enabled": true,
        "model": "demo-deterministic"
      }
    ],
    "mcpServers": 0,
    "traceEvents": 27,
    "pendingApprovals": 0,
    "languages": [
      {
        "id": "typescript",
        "displayName": "TypeScript / JavaScript",
        "extensions": [
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
          ".mjs",
          ".cjs"
        ],
        "available": true
      },
      {
        "id": "python",
        "displayName": "Python",
        "extensions": [
          ".py"
        ],
        "available": true
      }
    ]
  },
  "modules.list": [
    {
      "id": "agent-control",
      "enabled": true,
      "core": true,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.368Z"
    },
    {
      "id": "project-intelligence",
      "enabled": true,
      "core": true,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.368Z"
    },
    {
      "id": "openbridge",
      "enabled": true,
      "core": true,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.368Z"
    },
    {
      "id": "tracex",
      "enabled": true,
      "core": true,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.368Z"
    },
    {
      "id": "evaluation",
      "enabled": true,
      "core": true,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.368Z"
    },
    {
      "id": "providers",
      "enabled": true,
      "core": true,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.368Z"
    },
    {
      "id": "shared-context",
      "enabled": true,
      "core": true,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.368Z"
    },
    {
      "id": "echoshell",
      "enabled": true,
      "core": false,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.383Z"
    },
    {
      "id": "rebuild-studio",
      "enabled": true,
      "core": false,
      "config": {},
      "updatedAt": "2026-11-26T16:14:08.383Z"
    }
  ],
  "projects.list": [
    {
      "id": "prj_f24b5d9525194aa6a717",
      "name": "sample-app",
      "rootPath": "C:\\Users\\you\\code\\sample-app",
      "status": "ready",
      "createdAt": "2026-11-26T16:14:08.387Z",
      "lastIndexedAt": "2026-11-26T16:14:08.566Z",
      "indexState": "ready",
      "indexStats": {
        "filesDiscovered": 7,
        "filesIndexed": 7,
        "filesSkipped": 0,
        "filesFailed": 0,
        "symbols": 18,
        "edges": 5,
        "languages": {
          "md": 1,
          "json": 1,
          "typescript": 4,
          "python": 1
        },
        "durationMs": 6
      },
      "exclusions": {
        "ignorePatterns": [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/out/**",
          "**/coverage/**",
          "**/.next/**",
          "**/.nuxt/**",
          "**/.output/**",
          "**/.turbo/**",
          "**/.cache/**",
          "**/.venv/**",
          "**/venv/**",
          "**/__pycache__/**",
          "**/.mypy_cache/**",
          "**/.pytest_cache/**",
          "**/.ruff_cache/**",
          "**/vendor/**",
          "**/target/**",
          "**/.idea/**",
          "**/.vscode/**",
          "**/.arqenium-data/**",
          "**/release/**",
          "**/.gradle/**",
          "**/*.min.js",
          "**/*.min.css",
          "**/*.map",
          "**/*.pyc",
          "**/*.pyo",
          "**/*.o",
          "**/*.a",
          "**/*.so",
          "**/*.dylib",
          "**/*.dll",
          "**/*.exe",
          "**/*.wasm",
          "**/package-lock.json",
          "**/yarn.lock",
          "**/pnpm-lock.yaml",
          "**/poetry.lock",
          "**/Cargo.lock",
          "**/*.tsbuildinfo"
        ],
        "allowPatterns": [
          "**/.env.example",
          "**/.env.sample",
          "**/.env.template"
        ],
        "maxFileBytes": 1500000
      }
    }
  ],
  "projects.get": {
    "id": "prj_f24b5d9525194aa6a717",
    "name": "sample-app",
    "rootPath": "C:\\Users\\you\\code\\sample-app",
    "status": "ready",
    "createdAt": "2026-11-26T16:14:08.387Z",
    "lastIndexedAt": "2026-11-26T16:14:08.566Z",
    "indexState": "ready",
    "indexStats": {
      "filesDiscovered": 7,
      "filesIndexed": 7,
      "filesSkipped": 0,
      "filesFailed": 0,
      "symbols": 18,
      "edges": 5,
      "languages": {
        "md": 1,
        "json": 1,
        "typescript": 4,
        "python": 1
      },
      "durationMs": 6
    },
    "exclusions": {
      "ignorePatterns": [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/out/**",
        "**/coverage/**",
        "**/.next/**",
        "**/.nuxt/**",
        "**/.output/**",
        "**/.turbo/**",
        "**/.cache/**",
        "**/.venv/**",
        "**/venv/**",
        "**/__pycache__/**",
        "**/.mypy_cache/**",
        "**/.pytest_cache/**",
        "**/.ruff_cache/**",
        "**/vendor/**",
        "**/target/**",
        "**/.idea/**",
        "**/.vscode/**",
        "**/.arqenium-data/**",
        "**/release/**",
        "**/.gradle/**",
        "**/*.min.js",
        "**/*.min.css",
        "**/*.map",
        "**/*.pyc",
        "**/*.pyo",
        "**/*.o",
        "**/*.a",
        "**/*.so",
        "**/*.dylib",
        "**/*.dll",
        "**/*.exe",
        "**/*.wasm",
        "**/package-lock.json",
        "**/yarn.lock",
        "**/pnpm-lock.yaml",
        "**/poetry.lock",
        "**/Cargo.lock",
        "**/*.tsbuildinfo"
      ],
      "allowPatterns": [
        "**/.env.example",
        "**/.env.sample",
        "**/.env.template"
      ],
      "maxFileBytes": 1500000
    }
  },
  "projects.tree": [
    {
      "name": "package.json",
      "path": "package.json",
      "type": "file",
      "size": 147
    },
    {
      "name": "README.md",
      "path": "README.md",
      "type": "file",
      "size": 80
    },
    {
      "name": "src",
      "path": "src",
      "type": "dir",
      "children": [
        {
          "name": "index.ts",
          "path": "src/index.ts",
          "type": "file",
          "size": 410
        },
        {
          "name": "lib",
          "path": "src/lib",
          "type": "dir",
          "children": [
            {
              "name": "format.ts",
              "path": "src/lib/format.ts",
              "type": "file",
              "size": 234
            },
            {
              "name": "router.ts",
              "path": "src/lib/router.ts",
              "type": "file",
              "size": 370
            }
          ]
        },
        {
          "name": "service.py",
          "path": "src/service.py",
          "type": "file",
          "size": 399
        }
      ]
    },
    {
      "name": "tests",
      "path": "tests",
      "type": "dir",
      "children": [
        {
          "name": "router.test.ts",
          "path": "tests/router.test.ts",
          "type": "file",
          "size": 232
        }
      ]
    }
  ],
  "projects.file": {
    "content": "import { createRouter } from './lib/router';\nimport { formatBytes } from './lib/format';\n\nexport interface AppConfig {\n  port: number;\n  routes: string[];\n}\n\nexport function boot(config: AppConfig) {\n  const router = createRouter(config.routes);\n  return {\n    port: config.port,\n    match: (p: string) => router.match(p),\n    describe: () => `listening on ${config.port}`,\n    size: formatBytes(1024),\n  };\n}\n",
    "language": "typescript",
    "truncated": false,
    "bytes": 410
  },
  "projects.symbols": {
    "items": [
      {
        "id": "sym_8f966321d0d64b7d9ab8",
        "projectId": "prj_preview",
        "path": "src/index.ts",
        "name": "AppConfig",
        "kind": "interface",
        "line": 4,
        "endLine": 7,
        "signature": "export interface AppConfig",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_13c7d665eb3b4ce79788",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "Record",
        "kind": "class",
        "line": 4,
        "endLine": 6,
        "signature": "class Record:",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_725546b9f87c43b88ce7",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "RecordStore",
        "kind": "class",
        "line": 15,
        "endLine": 20,
        "signature": "class RecordStore:",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_14a9bc4d428d4ff18e25",
        "projectId": "prj_preview",
        "path": "src/lib/router.ts",
        "name": "Route",
        "kind": "interface",
        "line": 3,
        "endLine": 3,
        "signature": "export interface Route",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_4aa055f5f9c041a490f7",
        "projectId": "prj_preview",
        "path": "src/lib/router.ts",
        "name": "Router",
        "kind": "interface",
        "line": 5,
        "endLine": 7,
        "signature": "export interface Router",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_415534a8896c46c09847",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "__init__",
        "kind": "method",
        "line": 16,
        "endLine": 17,
        "signature": "def __init__(self):",
        "container": "RecordStore",
        "exported": false,
        "quality": "parsed"
      },
      {
        "id": "sym_cd37f3cf7b424914b0dd",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "add",
        "kind": "method",
        "line": 19,
        "endLine": 20,
        "signature": "def add(self, record):",
        "container": "RecordStore",
        "exported": false,
        "quality": "parsed"
      },
      {
        "id": "sym_c1e96e0eee524f28b369",
        "projectId": "prj_preview",
        "path": "src/index.ts",
        "name": "boot",
        "kind": "function",
        "line": 9,
        "endLine": 17,
        "signature": "export function boot(config: AppConfig) {",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_a2d2b0996cbb4188a69d",
        "projectId": "prj_preview",
        "path": "src/lib/router.ts",
        "name": "createRouter",
        "kind": "function",
        "line": 9,
        "endLine": 12,
        "signature": "export function createRouter(routes: string[]): Router {",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_bb40c902eeeb4738a5ea",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "dataclass",
        "kind": "variable",
        "line": 1,
        "endLine": 1,
        "signature": "from dataclasses import dataclass",
        "container": null,
        "exported": false,
        "quality": "parsed"
      },
      {
        "id": "sym_76661fa642fc4b71b255",
        "projectId": "prj_preview",
        "path": "src/lib/format.ts",
        "name": "formatBytes",
        "kind": "function",
        "line": 5,
        "endLine": 8,
        "signature": "export function formatBytes(n: number): string {",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_48199a476b1d40bca342",
        "projectId": "prj_preview",
        "path": "src/lib/format.ts",
        "name": "formatPath",
        "kind": "function",
        "line": 1,
        "endLine": 3,
        "signature": "export function formatPath(p: string): string {",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_2741425275504e33b980",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "key",
        "kind": "property",
        "line": 5,
        "endLine": 5,
        "signature": "key: str",
        "container": "Record",
        "exported": false,
        "quality": "parsed"
      },
      {
        "id": "sym_cb1fa64b85504459a225",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "parse_records",
        "kind": "function",
        "line": 8,
        "endLine": 13,
        "signature": "def parse_records(lines):",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_272920c5cca7489596d9",
        "projectId": "prj_preview",
        "path": "tests/router.test.ts",
        "name": "r",
        "kind": "variable",
        "line": 5,
        "endLine": 5,
        "signature": "const r",
        "container": null,
        "exported": false,
        "quality": "parsed"
      },
      {
        "id": "sym_f01e9db21c2c4a5a96d8",
        "projectId": "prj_preview",
        "path": "src/index.ts",
        "name": "router",
        "kind": "variable",
        "line": 10,
        "endLine": 10,
        "signature": "const router",
        "container": null,
        "exported": false,
        "quality": "parsed"
      },
      {
        "id": "sym_6dbdaaf25bcb4ed292ef",
        "projectId": "prj_preview",
        "path": "src/lib/router.ts",
        "name": "table",
        "kind": "variable",
        "line": 10,
        "endLine": 10,
        "signature": "const table",
        "container": null,
        "exported": false,
        "quality": "parsed"
      },
      {
        "id": "sym_45b715098a02465b9a80",
        "projectId": "prj_preview",
        "path": "src/service.py",
        "name": "value",
        "kind": "property",
        "line": 6,
        "endLine": 6,
        "signature": "value: int",
        "container": "Record",
        "exported": false,
        "quality": "parsed"
      }
    ],
    "total": 18
  },
  "projects.search": {
    "files": [
      {
        "path": "src/lib/format.ts",
        "language": "typescript",
        "bytes": 234
      }
    ],
    "symbols": [
      {
        "id": "sym_76661fa642fc4b71b255",
        "projectId": "prj_preview",
        "path": "src/lib/format.ts",
        "name": "formatBytes",
        "kind": "function",
        "line": 5,
        "endLine": 8,
        "signature": "export function formatBytes(n: number): string {",
        "container": null,
        "exported": true,
        "quality": "parsed"
      },
      {
        "id": "sym_48199a476b1d40bca342",
        "projectId": "prj_preview",
        "path": "src/lib/format.ts",
        "name": "formatPath",
        "kind": "function",
        "line": 1,
        "endLine": 3,
        "signature": "export function formatPath(p: string): string {",
        "container": null,
        "exported": true,
        "quality": "parsed"
      }
    ]
  },
  "projects.graph": {
    "nodes": [
      {
        "id": "README.md",
        "path": "README.md",
        "language": "md",
        "symbolCount": 0,
        "isTest": false,
        "changed": false
      },
      {
        "id": "package.json",
        "path": "package.json",
        "language": "json",
        "symbolCount": 0,
        "isTest": false,
        "changed": false
      },
      {
        "id": "tests/router.test.ts",
        "path": "tests/router.test.ts",
        "language": "typescript",
        "symbolCount": 1,
        "isTest": true,
        "changed": false
      },
      {
        "id": "src/index.ts",
        "path": "src/index.ts",
        "language": "typescript",
        "symbolCount": 3,
        "isTest": false,
        "changed": false
      },
      {
        "id": "src/service.py",
        "path": "src/service.py",
        "language": "python",
        "symbolCount": 8,
        "isTest": false,
        "changed": false
      },
      {
        "id": "src/lib/format.ts",
        "path": "src/lib/format.ts",
        "language": "typescript",
        "symbolCount": 2,
        "isTest": false,
        "changed": false
      },
      {
        "id": "src/lib/router.ts",
        "path": "src/lib/router.ts",
        "language": "typescript",
        "symbolCount": 4,
        "isTest": false,
        "changed": false
      },
      {
        "id": "ext:dataclasses",
        "path": "dataclasses",
        "language": "external",
        "symbolCount": 0,
        "isTest": false,
        "changed": false,
        "external": true
      }
    ],
    "edges": [
      {
        "from": "src/service.py",
        "to": "ext:dataclasses",
        "external": true,
        "resolved": false
      },
      {
        "from": "src/index.ts",
        "to": "src/lib/format.ts",
        "external": false,
        "resolved": true
      },
      {
        "from": "src/lib/router.ts",
        "to": "src/lib/format.ts",
        "external": false,
        "resolved": true
      },
      {
        "from": "tests/router.test.ts",
        "to": "src/lib/router.ts",
        "external": false,
        "resolved": true
      },
      {
        "from": "src/index.ts",
        "to": "src/lib/router.ts",
        "external": false,
        "resolved": true
      }
    ]
  },
  "projects.impact": {
    "source": [
      "src/lib/format.ts"
    ],
    "affected": [
      {
        "path": "src/index.ts",
        "depth": 1,
        "reason": "imports src/lib/format.ts",
        "via": [
          "src/lib/format.ts"
        ],
        "confidence": "parsed",
        "isTest": false
      },
      {
        "path": "src/lib/router.ts",
        "depth": 1,
        "reason": "imports src/lib/format.ts",
        "via": [
          "src/lib/format.ts"
        ],
        "confidence": "parsed",
        "isTest": false
      },
      {
        "path": "tests/router.test.ts",
        "depth": 2,
        "reason": "imports src/lib/router.ts",
        "via": [
          "src/lib/format.ts",
          "src/lib/router.ts"
        ],
        "confidence": "parsed",
        "isTest": true
      }
    ],
    "tests": [
      "tests/router.test.ts"
    ],
    "truncated": false
  },
  "projects.summary": {
    "path": "src/index.ts",
    "language": "typescript",
    "lines": 18,
    "bytes": 410,
    "symbolCount": 3,
    "importCount": 2,
    "symbols": [
      {
        "name": "AppConfig",
        "kind": "interface",
        "line": 4
      },
      {
        "name": "boot",
        "kind": "function",
        "line": 9
      },
      {
        "name": "router",
        "kind": "variable",
        "line": 10
      }
    ],
    "imports": [
      {
        "moduleSpec": "./lib/router",
        "resolved": "src/lib/router.ts",
        "line": 1
      },
      {
        "moduleSpec": "./lib/format",
        "resolved": "src/lib/format.ts",
        "line": 2
      }
    ],
    "externalImports": [],
    "dependents": [],
    "hasTests": false,
    "todoCount": 0,
    "quality": "parsed",
    "notes": [
      "Deterministic summary extracted from indexed source content (no model inference)."
    ]
  },
  "projects.changes": {
    "available": false,
    "branch": null,
    "changes": [],
    "message": "No Git repository detected in this project"
  },
  "projects.stats": {
    "state": "ready",
    "stats": {
      "filesDiscovered": 7,
      "filesIndexed": 7,
      "filesSkipped": 0,
      "filesFailed": 0,
      "symbols": 18,
      "edges": 5,
      "languages": {
        "md": 1,
        "json": 1,
        "typescript": 4,
        "python": 1
      },
      "durationMs": 6
    },
    "languages": [
      {
        "id": "typescript",
        "displayName": "TypeScript / JavaScript",
        "extensions": [
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
          ".mjs",
          ".cjs"
        ],
        "available": true
      },
      {
        "id": "python",
        "displayName": "Python",
        "extensions": [
          ".py"
        ],
        "available": true
      }
    ],
    "files": 7,
    "symbols": 18
  },
  "agents.list": [
    {
      "id": "agent_4efbb4a5d9da421682f6",
      "projectId": "prj_preview",
      "name": "Planner",
      "role": "planner",
      "description": "Breaks work into concrete tasks and defines acceptance criteria.",
      "systemPrompt": "You are the Planner agent. Decompose the requested engineering work into clear, verifiable steps. State assumptions explicitly and identify risks. Do not modify files.",
      "modelRef": null,
      "tools": [
        "project_structure",
        "search_symbols",
        "search_files",
        "read_file",
        "dependency_graph",
        "impact_analysis"
      ],
      "permissions": {
        "canReadFiles": true,
        "canWriteFiles": false,
        "canRunCommands": false,
        "autoApprove": []
      },
      "maxIterations": 8,
      "timeoutMs": 120000,
      "maxRetries": 1,
      "createdAt": "2026-11-26T16:14:08.492Z",
      "updatedAt": "2026-11-26T16:14:08.492Z"
    },
    {
      "id": "agent_20eebcbb74b94866b32f",
      "projectId": "prj_preview",
      "name": "Reviewer",
      "role": "reviewer",
      "description": "Reviews outputs for correctness, risk and consistency with the project.",
      "systemPrompt": "You are the Reviewer agent. Evaluate the provided work against the project context. List concrete findings with file references. Separate verified facts from opinions.",
      "modelRef": null,
      "tools": [
        "project_structure",
        "search_symbols",
        "read_file",
        "dependency_graph",
        "impact_analysis"
      ],
      "permissions": {
        "canReadFiles": true,
        "canWriteFiles": false,
        "canRunCommands": false,
        "autoApprove": []
      },
      "maxIterations": 8,
      "timeoutMs": 120000,
      "maxRetries": 1,
      "createdAt": "2026-11-26T16:14:08.493Z",
      "updatedAt": "2026-11-26T16:14:08.493Z"
    }
  ],
  "agents.templates": [
    {
      "role": "planner",
      "name": "Planner",
      "description": "Breaks work into concrete tasks and defines acceptance criteria.",
      "systemPrompt": "You are the Planner agent. Decompose the requested engineering work into clear, verifiable steps. State assumptions explicitly and identify risks. Do not modify files.",
      "tools": [
        "project_structure",
        "search_symbols",
        "search_files",
        "read_file",
        "dependency_graph",
        "impact_analysis"
      ]
    },
    {
      "role": "architect",
      "name": "Architect",
      "description": "Designs solutions grounded in the actual project structure.",
      "systemPrompt": "You are the Architect agent. Propose designs that fit the existing codebase. Reference real files and symbols when justifying decisions. Flag uncertainty instead of guessing.",
      "tools": [
        "project_structure",
        "search_symbols",
        "read_file",
        "dependency_graph",
        "impact_analysis",
        "project_summary"
      ]
    },
    {
      "role": "implementer",
      "name": "Implementer",
      "description": "Produces concrete code changes and reports exactly what changed.",
      "systemPrompt": "You are the Implementer agent. Produce precise code changes as file operations. Every claim must match content you actually read or wrote. Report changed paths and symbols.",
      "tools": [
        "project_structure",
        "search_symbols",
        "read_file",
        "write_file",
        "project_summary"
      ]
    },
    {
      "role": "reviewer",
      "name": "Reviewer",
      "description": "Reviews outputs for correctness, risk and consistency with the project.",
      "systemPrompt": "You are the Reviewer agent. Evaluate the provided work against the project context. List concrete findings with file references. Separate verified facts from opinions.",
      "tools": [
        "project_structure",
        "search_symbols",
        "read_file",
        "dependency_graph",
        "impact_analysis"
      ]
    },
    {
      "role": "tester",
      "name": "Tester",
      "description": "Designs and runs verification steps, reporting objective results.",
      "systemPrompt": "You are the Tester agent. Define and execute verification steps. Report only observed results and clearly mark anything not executed.",
      "tools": [
        "project_structure",
        "search_symbols",
        "read_file",
        "run_command",
        "project_summary"
      ]
    },
    {
      "role": "documentation",
      "name": "Documentation Agent",
      "description": "Produces documentation grounded in source content.",
      "systemPrompt": "You are the Documentation agent. Write documentation that reflects the real source. Quote actual symbols and paths; never invent APIs.",
      "tools": [
        "project_structure",
        "search_symbols",
        "read_file",
        "project_summary"
      ]
    },
    {
      "role": "custom",
      "name": "Custom",
      "description": "Free-form role with a fully custom prompt and tool set.",
      "systemPrompt": "You are a specialized engineering agent. Follow the assigned task and report verified outcomes only.",
      "tools": [
        "project_structure",
        "search_symbols",
        "read_file"
      ]
    }
  ],
  "runs.list": [
    {
      "id": "run_58eb56100a9e4d7a97a2",
      "projectId": "prj_preview",
      "kind": "orchestration",
      "mode": "demo",
      "trigger": "user",
      "status": "completed",
      "labels": [
        "demo",
        "sample-app"
      ],
      "budget": {
        "maxDurationMs": 600000,
        "maxToolCalls": 60,
        "maxTokens": 400000,
        "maxTasks": 100
      },
      "stats": {
        "toolCalls": 2,
        "tokensIn": 0,
        "tokensOut": 0,
        "tasksCompleted": 1,
        "tasksFailed": 0,
        "providerRequests": 4,
        "estimatedCost": null
      },
      "error": null,
      "createdAt": "2026-11-26T16:14:08.493Z",
      "startedAt": "2026-11-26T16:14:08.495Z",
      "finishedAt": "2026-11-26T16:14:08.506Z"
    }
  ],
  "runs.get": {
    "run": {
      "id": "run_58eb56100a9e4d7a97a2",
      "projectId": "prj_preview",
      "kind": "orchestration",
      "mode": "demo",
      "trigger": "user",
      "status": "completed",
      "labels": [
        "demo",
        "sample-app"
      ],
      "budget": {
        "maxDurationMs": 600000,
        "maxToolCalls": 60,
        "maxTokens": 400000,
        "maxTasks": 100
      },
      "stats": {
        "toolCalls": 2,
        "tokensIn": 0,
        "tokensOut": 0,
        "tasksCompleted": 1,
        "tasksFailed": 0,
        "providerRequests": 4,
        "estimatedCost": null
      },
      "error": null,
      "createdAt": "2026-11-26T16:14:08.493Z",
      "startedAt": "2026-11-26T16:14:08.495Z",
      "finishedAt": "2026-11-26T16:14:08.506Z"
    },
    "tasks": [
      {
        "id": "task_6599fcbdf35d4c48b8e8",
        "runId": "run_58eb56100a9e4d7a97a2",
        "projectId": "prj_preview",
        "title": "Summarise the sample project",
        "description": "Describe the entrypoint and the modules it pulls in.",
        "status": "completed",
        "pipeline": [
          "agent_4efbb4a5d9da421682f6",
          "agent_20eebcbb74b94866b32f"
        ],
        "dependsOn": [],
        "priority": 1,
        "input": "Describe src/index.ts and the modules it imports.",
        "output": "Demo agent output (sample data - not generated by a real model).\n\nTask context: Complete the task: Summarise the sample project\n\nDescribe the entrypoint and the modules it pulls in.\n\nUse the available tools to verify your work, then reply with your final answer.\n\nObserved tool result:\n{\n  \"total\": 0,\n  \"symbols\": []\n}\n\nNext step for a real provider: review the observed data and produce the final answer.",
        "error": null,
        "attempts": 1,
        "maxAttempts": 1,
        "createdAt": "2026-11-26T16:14:08.493Z",
        "startedAt": "2026-11-26T16:14:08.496Z",
        "finishedAt": "2026-11-26T16:14:08.505Z"
      }
    ]
  },
  "runs.events": [
    {
      "id": "evt_494ecd075f834a749945",
      "ts": "2026-11-26T16:14:08.494Z",
      "type": "run.created",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": null,
      "agentId": null,
      "correlationId": null,
      "source": "orchestration",
      "message": "Run created with 1 task(s) [mode=demo]",
      "data": {
        "mode": "demo",
        "labels": [
          "demo",
          "sample-app"
        ],
        "tasks": 1,
        "kind": "orchestration"
      },
      "durationMs": null
    },
    {
      "id": "evt_69a85c97afb440878949",
      "ts": "2026-11-26T16:14:08.495Z",
      "type": "run.started",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": null,
      "agentId": null,
      "correlationId": null,
      "source": "orchestration",
      "message": "Run started [mode=demo]",
      "data": {
        "mode": "demo",
        "budget": {
          "maxDurationMs": 600000,
          "maxToolCalls": 60,
          "maxTokens": 400000,
          "maxTasks": 100
        }
      },
      "durationMs": null
    },
    {
      "id": "evt_6df50e618c634d3fa268",
      "ts": "2026-11-26T16:14:08.496Z",
      "type": "task.started",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "agentId": null,
      "correlationId": null,
      "source": "orchestration",
      "message": "Task started: Summarise the sample project",
      "data": {
        "pipeline": [
          "agent_4efbb4a5d9da421682f6",
          "agent_20eebcbb74b94866b32f"
        ]
      },
      "durationMs": null
    },
    {
      "id": "evt_a49135eef8904f2c91af",
      "ts": "2026-11-26T16:14:08.501Z",
      "type": "tool.call",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "agentId": "agent_4efbb4a5d9da421682f6",
      "correlationId": "task_6599fcbdf35d4c48b8e8",
      "source": "orchestration",
      "message": "Planner -> search_symbols",
      "data": {
        "tool": "search_symbols",
        "args": {
          "query": "Complete the task: Summarise the sample project Describe the entrypoint and the "
        }
      },
      "durationMs": null
    },
    {
      "id": "evt_682c1c021a68437f98fb",
      "ts": "2026-11-26T16:14:08.502Z",
      "type": "tool.result",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "agentId": "agent_4efbb4a5d9da421682f6",
      "correlationId": "task_6599fcbdf35d4c48b8e8",
      "source": "orchestration",
      "message": "search_symbols: ok",
      "data": {
        "tool": "search_symbols",
        "status": "ok"
      },
      "durationMs": null
    },
    {
      "id": "evt_6ffbf84418014f0384a7",
      "ts": "2026-11-26T16:14:08.503Z",
      "type": "tool.call",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "agentId": "agent_20eebcbb74b94866b32f",
      "correlationId": "task_6599fcbdf35d4c48b8e8",
      "source": "orchestration",
      "message": "Reviewer -> search_symbols",
      "data": {
        "tool": "search_symbols",
        "args": {
          "query": "Complete the task: Summarise the sample project Describe the entrypoint and the "
        }
      },
      "durationMs": null
    },
    {
      "id": "evt_0625ba6b62f144deaddd",
      "ts": "2026-11-26T16:14:08.504Z",
      "type": "tool.result",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "agentId": "agent_20eebcbb74b94866b32f",
      "correlationId": "task_6599fcbdf35d4c48b8e8",
      "source": "orchestration",
      "message": "search_symbols: ok",
      "data": {
        "tool": "search_symbols",
        "status": "ok"
      },
      "durationMs": null
    },
    {
      "id": "evt_1f031c039e594de58194",
      "ts": "2026-11-26T16:14:08.505Z",
      "type": "task.completed",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "agentId": null,
      "correlationId": null,
      "source": "orchestration",
      "message": "Task completed: Summarise the sample project",
      "data": {
        "attempts": 1,
        "outputChars": 406
      },
      "durationMs": null
    },
    {
      "id": "evt_b2ed914aa2614e138125",
      "ts": "2026-11-26T16:14:08.506Z",
      "type": "run.completed",
      "severity": "info",
      "projectId": "prj_preview",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": null,
      "agentId": null,
      "correlationId": null,
      "source": "orchestration",
      "message": "Run completed",
      "data": {
        "status": "completed",
        "error": null
      },
      "durationMs": null
    }
  ],
  "approvals.list": [],
  "providers.list": [
    {
      "id": "prov_86ae14c35a774f8b803b",
      "kind": "demo",
      "name": "Demo (sample data)",
      "baseUrl": null,
      "defaultModel": "demo-deterministic",
      "enabled": true,
      "credentialRef": null,
      "config": {},
      "createdAt": "2026-11-26T16:14:08.369Z",
      "updatedAt": "2026-11-26T16:14:08.369Z"
    }
  ],
  "providers.models": [
    {
      "id": "demo-deterministic",
      "name": "Demo (sample data, not a real model)",
      "contextWindow": 16000
    }
  ],
  "trace.events": {
    "items": [
      {
        "id": "evt_9d8dc317f6e74635840a",
        "ts": "2026-11-26T16:14:08.566Z",
        "type": "project.index.completed",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "app",
        "message": "Indexed 7 files, 18 symbols",
        "data": {
          "filesDiscovered": 7,
          "filesIndexed": 7,
          "filesSkipped": 0,
          "filesFailed": 0,
          "symbols": 18,
          "edges": 5,
          "languages": {
            "md": 1,
            "json": 1,
            "typescript": 4,
            "python": 1
          },
          "durationMs": 6
        },
        "durationMs": 6
      },
      {
        "id": "evt_bb85ff244a794c649746",
        "ts": "2026-11-26T16:14:08.506Z",
        "type": "app.demo.seeded",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "app",
        "message": "Hosted preview seeded with a sample project",
        "data": {
          "projectId": "prj_preview",
          "skipped": []
        },
        "durationMs": null
      },
      {
        "id": "evt_b2ed914aa2614e138125",
        "ts": "2026-11-26T16:14:08.506Z",
        "type": "run.completed",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "orchestration",
        "message": "Run completed",
        "data": {
          "status": "completed",
          "error": null
        },
        "durationMs": null
      },
      {
        "id": "evt_1f031c039e594de58194",
        "ts": "2026-11-26T16:14:08.505Z",
        "type": "task.completed",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": "task_6599fcbdf35d4c48b8e8",
        "agentId": null,
        "correlationId": null,
        "source": "orchestration",
        "message": "Task completed: Summarise the sample project",
        "data": {
          "attempts": 1,
          "outputChars": 406
        },
        "durationMs": null
      },
      {
        "id": "evt_353c44251f8041f8a6ca",
        "ts": "2026-11-26T16:14:08.504Z",
        "type": "provider.response",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo response in 0ms",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "model": "demo-deterministic",
          "usage": {
            "tokensIn": 0,
            "tokensOut": 0
          },
          "finishReason": "stop",
          "attempt": 0
        },
        "durationMs": 0
      },
      {
        "id": "evt_e7daa1e12d7f405eaf85",
        "ts": "2026-11-26T16:14:08.504Z",
        "type": "provider.request",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo/demo-deterministic request",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "kind": "demo",
          "model": "demo-deterministic",
          "messages": 4,
          "tools": 5
        },
        "durationMs": null
      },
      {
        "id": "evt_0625ba6b62f144deaddd",
        "ts": "2026-11-26T16:14:08.504Z",
        "type": "tool.result",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": "task_6599fcbdf35d4c48b8e8",
        "agentId": "agent_20eebcbb74b94866b32f",
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "orchestration",
        "message": "search_symbols: ok",
        "data": {
          "tool": "search_symbols",
          "status": "ok"
        },
        "durationMs": null
      },
      {
        "id": "evt_6ffbf84418014f0384a7",
        "ts": "2026-11-26T16:14:08.503Z",
        "type": "tool.call",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": "task_6599fcbdf35d4c48b8e8",
        "agentId": "agent_20eebcbb74b94866b32f",
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "orchestration",
        "message": "Reviewer -> search_symbols",
        "data": {
          "tool": "search_symbols",
          "args": {
            "query": "Complete the task: Summarise the sample project Describe the entrypoint and the "
          }
        },
        "durationMs": null
      },
      {
        "id": "evt_5d97234f129f45be89e2",
        "ts": "2026-11-26T16:14:08.503Z",
        "type": "provider.response",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo response in 0ms",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "model": "demo-deterministic",
          "usage": {
            "tokensIn": 0,
            "tokensOut": 0
          },
          "finishReason": "tool-calls",
          "attempt": 0
        },
        "durationMs": 0
      },
      {
        "id": "evt_4628dc337dd84e259b25",
        "ts": "2026-11-26T16:14:08.503Z",
        "type": "provider.request",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo/demo-deterministic request",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "kind": "demo",
          "model": "demo-deterministic",
          "messages": 2,
          "tools": 5
        },
        "durationMs": null
      },
      {
        "id": "evt_9c6ab48b356f4070889a",
        "ts": "2026-11-26T16:14:08.502Z",
        "type": "provider.response",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo response in 0ms",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "model": "demo-deterministic",
          "usage": {
            "tokensIn": 0,
            "tokensOut": 0
          },
          "finishReason": "stop",
          "attempt": 0
        },
        "durationMs": 0
      },
      {
        "id": "evt_759cd2b69fab49e98caf",
        "ts": "2026-11-26T16:14:08.502Z",
        "type": "provider.request",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo/demo-deterministic request",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "kind": "demo",
          "model": "demo-deterministic",
          "messages": 4,
          "tools": 6
        },
        "durationMs": null
      },
      {
        "id": "evt_682c1c021a68437f98fb",
        "ts": "2026-11-26T16:14:08.502Z",
        "type": "tool.result",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": "task_6599fcbdf35d4c48b8e8",
        "agentId": "agent_4efbb4a5d9da421682f6",
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "orchestration",
        "message": "search_symbols: ok",
        "data": {
          "tool": "search_symbols",
          "status": "ok"
        },
        "durationMs": null
      },
      {
        "id": "evt_a49135eef8904f2c91af",
        "ts": "2026-11-26T16:14:08.501Z",
        "type": "tool.call",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": "task_6599fcbdf35d4c48b8e8",
        "agentId": "agent_4efbb4a5d9da421682f6",
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "orchestration",
        "message": "Planner -> search_symbols",
        "data": {
          "tool": "search_symbols",
          "args": {
            "query": "Complete the task: Summarise the sample project Describe the entrypoint and the "
          }
        },
        "durationMs": null
      },
      {
        "id": "evt_23be32b4720840a59992",
        "ts": "2026-11-26T16:14:08.500Z",
        "type": "provider.response",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo response in 0ms",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "model": "demo-deterministic",
          "usage": {
            "tokensIn": 0,
            "tokensOut": 0
          },
          "finishReason": "tool-calls",
          "attempt": 0
        },
        "durationMs": 0
      },
      {
        "id": "evt_995028f75ff546a18138",
        "ts": "2026-11-26T16:14:08.500Z",
        "type": "provider.request",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": "task_6599fcbdf35d4c48b8e8",
        "source": "providers",
        "message": "demo/demo-deterministic request",
        "data": {
          "providerId": "prov_86ae14c35a774f8b803b",
          "kind": "demo",
          "model": "demo-deterministic",
          "messages": 2,
          "tools": 6
        },
        "durationMs": null
      },
      {
        "id": "evt_6df50e618c634d3fa268",
        "ts": "2026-11-26T16:14:08.496Z",
        "type": "task.started",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": "task_6599fcbdf35d4c48b8e8",
        "agentId": null,
        "correlationId": null,
        "source": "orchestration",
        "message": "Task started: Summarise the sample project",
        "data": {
          "pipeline": [
            "agent_4efbb4a5d9da421682f6",
            "agent_20eebcbb74b94866b32f"
          ]
        },
        "durationMs": null
      },
      {
        "id": "evt_69a85c97afb440878949",
        "ts": "2026-11-26T16:14:08.495Z",
        "type": "run.started",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "orchestration",
        "message": "Run started [mode=demo]",
        "data": {
          "mode": "demo",
          "budget": {
            "maxDurationMs": 600000,
            "maxToolCalls": 60,
            "maxTokens": 400000,
            "maxTasks": 100
          }
        },
        "durationMs": null
      },
      {
        "id": "evt_494ecd075f834a749945",
        "ts": "2026-11-26T16:14:08.494Z",
        "type": "run.created",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": "run_58eb56100a9e4d7a97a2",
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "orchestration",
        "message": "Run created with 1 task(s) [mode=demo]",
        "data": {
          "mode": "demo",
          "labels": [
            "demo",
            "sample-app"
          ],
          "tasks": 1,
          "kind": "orchestration"
        },
        "durationMs": null
      },
      {
        "id": "evt_6e2ff60e7d4641d2b9e2",
        "ts": "2026-11-26T16:14:08.493Z",
        "type": "agent.created",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": null,
        "taskId": null,
        "agentId": "agent_20eebcbb74b94866b32f",
        "correlationId": null,
        "source": "agents",
        "message": "Agent Reviewer (reviewer) created",
        "data": {
          "id": "agent_20eebcbb74b94866b32f",
          "role": "reviewer",
          "tools": [
            "project_structure",
            "search_symbols",
            "read_file",
            "dependency_graph",
            "impact_analysis"
          ]
        },
        "durationMs": null
      },
      {
        "id": "evt_99a3ca16221d40d08c67",
        "ts": "2026-11-26T16:14:08.492Z",
        "type": "agent.created",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": null,
        "taskId": null,
        "agentId": "agent_4efbb4a5d9da421682f6",
        "correlationId": null,
        "source": "agents",
        "message": "Agent Planner (planner) created",
        "data": {
          "id": "agent_4efbb4a5d9da421682f6",
          "role": "planner",
          "tools": [
            "project_structure",
            "search_symbols",
            "search_files",
            "read_file",
            "dependency_graph",
            "impact_analysis"
          ]
        },
        "durationMs": null
      },
      {
        "id": "evt_ab274245320543499530",
        "ts": "2026-11-26T16:14:08.459Z",
        "type": "project.index.completed",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "app",
        "message": "Indexed 7 files, 18 symbols",
        "data": {
          "filesDiscovered": 7,
          "filesIndexed": 7,
          "filesSkipped": 0,
          "filesFailed": 0,
          "symbols": 18,
          "edges": 5,
          "languages": {
            "md": 1,
            "json": 1,
            "typescript": 4,
            "python": 1
          },
          "durationMs": 70
        },
        "durationMs": 70
      },
      {
        "id": "evt_f222c52b9b694350b2ce",
        "ts": "2026-11-26T16:14:08.458Z",
        "type": "project.index.progress",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "app",
        "message": "Indexed 14/7 files",
        "data": {
          "processed": 14,
          "total": 7
        },
        "durationMs": null
      },
      {
        "id": "evt_5bd02095c6364c2399d2",
        "ts": "2026-11-26T16:14:08.387Z",
        "type": "project.created",
        "severity": "info",
        "projectId": "prj_preview",
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "app",
        "message": "Project sample-app added",
        "data": {
          "rootPath": "C:\\Users\\you\\code\\sample-app"
        },
        "durationMs": null
      },
      {
        "id": "evt_59544d9f7232427196af",
        "ts": "2026-11-26T16:14:08.383Z",
        "type": "module.enabled",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "modules",
        "message": "rebuild-studio enabled",
        "data": {
          "moduleId": "rebuild-studio",
          "enabled": true
        },
        "durationMs": null
      },
      {
        "id": "evt_bcc6d937e94c45d9ab5c",
        "ts": "2026-11-26T16:14:08.383Z",
        "type": "module.enabled",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "modules",
        "message": "echoshell enabled",
        "data": {
          "moduleId": "echoshell",
          "enabled": true
        },
        "durationMs": null
      },
      {
        "id": "evt_b4708ab05d2e4bd191dc",
        "ts": "2026-11-26T16:14:08.381Z",
        "type": "app.started",
        "severity": "info",
        "projectId": null,
        "runId": null,
        "taskId": null,
        "agentId": null,
        "correlationId": null,
        "source": "app",
        "message": "ARQENIUM API started on port 4599",
        "data": {
          "runtime": "web",
          "staticDir": "/home/user/Arqenium/dist/renderer",
          "demoMode": true
        },
        "durationMs": null
      }
    ],
    "total": 27
  },
  "trace.toolCalls": [
    {
      "id": "tcall_6c431a0cc68746e8827f",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "server": "internal",
      "tool": "search_symbols",
      "source": "agent",
      "input": {
        "query": "Complete the task: Summarise the sample project Describe the entrypoint and the "
      },
      "output": {
        "length": 33
      },
      "status": "ok",
      "error": null,
      "approvalId": null,
      "startedAt": "2026-11-26T16:14:08.504Z",
      "finishedAt": "2026-11-26T16:14:08.504Z",
      "durationMs": 0
    },
    {
      "id": "tcall_ccfb1a9fde8544749b19",
      "runId": "run_58eb56100a9e4d7a97a2",
      "taskId": "task_6599fcbdf35d4c48b8e8",
      "server": "internal",
      "tool": "search_symbols",
      "source": "agent",
      "input": {
        "query": "Complete the task: Summarise the sample project Describe the entrypoint and the "
      },
      "output": {
        "length": 33
      },
      "status": "ok",
      "error": null,
      "approvalId": null,
      "startedAt": "2026-11-26T16:14:08.501Z",
      "finishedAt": "2026-11-26T16:14:08.502Z",
      "durationMs": 1
    }
  ],
  "trace.summary": {
    "events": 27,
    "errors": 0,
    "warnings": 0,
    "failures": [],
    "avgTaskMs": null,
    "toolCalls": 2,
    "durationMs": null
  },
  "trace.eventTypes": [
    {
      "type": "provider.request",
      "count": 4
    },
    {
      "type": "provider.response",
      "count": 4
    },
    {
      "type": "agent.created",
      "count": 2
    },
    {
      "type": "module.enabled",
      "count": 2
    },
    {
      "type": "project.index.completed",
      "count": 2
    },
    {
      "type": "tool.call",
      "count": 2
    },
    {
      "type": "tool.result",
      "count": 2
    },
    {
      "type": "app.demo.seeded",
      "count": 1
    },
    {
      "type": "app.started",
      "count": 1
    },
    {
      "type": "project.created",
      "count": 1
    },
    {
      "type": "project.index.progress",
      "count": 1
    },
    {
      "type": "run.completed",
      "count": 1
    },
    {
      "type": "run.created",
      "count": 1
    },
    {
      "type": "run.started",
      "count": 1
    },
    {
      "type": "task.completed",
      "count": 1
    },
    {
      "type": "task.started",
      "count": 1
    }
  ],
  "evals.suites": [
    {
      "id": "suite-agent-engineering",
      "name": "Agent engineering tasks",
      "description": "AI cases that exercise the orchestration engine end to end. They only run when an agent and a project are selected; objective task status is reported separately from the heuristic criteria judgment.",
      "kind": "ai",
      "builtin": true,
      "createdAt": "2026-11-26T16:14:08.374Z",
      "updatedAt": "2026-11-26T16:14:08.374Z",
      "cases": [
        {
          "id": "suite-agent-engineering-c1",
          "suiteId": "suite-agent-engineering",
          "name": "Summarise the project structure",
          "description": "The agent must inspect the project and describe its structure with real file paths.",
          "kind": "ai",
          "config": {
            "input": "Inspect the project structure and summarise the main modules with their file paths."
          },
          "criteria": "The answer must reference \"src\" and describe at least two files.",
          "orderIndex": 0
        },
        {
          "id": "suite-agent-engineering-c2",
          "suiteId": "suite-agent-engineering",
          "name": "Locate a symbol and its dependencies",
          "description": "The agent must use symbol search and dependency tools rather than guessing.",
          "kind": "ai",
          "config": {
            "input": "Find the main exported function and list the files that import it."
          },
          "criteria": "The answer must quote at least one real file path from the index.",
          "orderIndex": 1
        }
      ]
    },
    {
      "id": "suite-fixture-integrity",
      "name": "Fixture project integrity",
      "description": "Verifies the bundled fixture repository used by the test suite. Runs without any AI provider and proves the indexing pipeline reads real content.",
      "kind": "deterministic",
      "builtin": true,
      "createdAt": "2026-11-26T16:14:08.373Z",
      "updatedAt": "2026-11-26T16:14:08.373Z",
      "cases": [
        {
          "id": "suite-fixture-integrity-c1",
          "suiteId": "suite-fixture-integrity",
          "name": "Fixture app entrypoint declares routes",
          "description": "The fixture entrypoint must define the documented route table.",
          "kind": "deterministic",
          "config": {
            "type": "fixture_content",
            "fixturePath": "fixture-app/src/index.ts",
            "expect": {
              "contains": [
                "startServer",
                "routes",
                "routesTable"
              ],
              "minLines": 10
            }
          },
          "criteria": "Fixture content check.",
          "orderIndex": 0
        },
        {
          "id": "suite-fixture-integrity-c2",
          "suiteId": "suite-fixture-integrity",
          "name": "Fixture service exports parser",
          "description": "The fixture service module must export its parsing function.",
          "kind": "deterministic",
          "config": {
            "type": "fixture_content",
            "fixturePath": "fixture-app/src/service.py",
            "expect": {
              "contains": [
                "def parse_records",
                "class RecordStore",
                "def summarise"
              ],
              "minLines": 10
            }
          },
          "criteria": "Fixture content check.",
          "orderIndex": 1
        },
        {
          "id": "suite-fixture-integrity-c3",
          "suiteId": "suite-fixture-integrity",
          "name": "Operation log contains no secrets",
          "description": "Scans the last 500 TraceX events for fixture token patterns that must never be persisted.",
          "kind": "deterministic",
          "config": {
            "type": "no_secret_leak",
            "expect": {
              "forbidden": [
                "sk-test-SECRET-000",
                "super-secret-value"
              ]
            }
          },
          "criteria": "Redaction check.",
          "orderIndex": 2
        }
      ]
    },
    {
      "id": "suite-project-index",
      "name": "Project intelligence checks",
      "description": "Validates the live project index: file and symbol counts plus symbol search behaviour. Requires an indexed project but no AI provider.",
      "kind": "deterministic",
      "builtin": true,
      "createdAt": "2026-11-26T16:14:08.374Z",
      "updatedAt": "2026-11-26T16:14:08.374Z",
      "cases": [
        {
          "id": "suite-project-index-c1",
          "suiteId": "suite-project-index",
          "name": "Index has parsed files and symbols",
          "description": "The selected project must contain indexed files and parsed symbols.",
          "kind": "deterministic",
          "config": {
            "type": "project_index",
            "expect": {
              "minFiles": 1,
              "minSymbols": 1
            }
          },
          "criteria": "Index completeness check.",
          "orderIndex": 0
        },
        {
          "id": "suite-project-index-c2",
          "suiteId": "suite-project-index",
          "name": "Symbol search returns results",
          "description": "Searching for a common identifier must return at least one parsed symbol.",
          "kind": "deterministic",
          "config": {
            "type": "symbol_search",
            "query": "a",
            "expect": {
              "minResults": 1
            }
          },
          "criteria": "Search check.",
          "orderIndex": 1
        }
      ]
    }
  ],
  "evals.runs": [],
  "evals.results": [],
  "mcp.list": [],
  "mcp.directory": [
    {
      "id": "arqenium-internal",
      "name": "ARQENIUM Internal Server",
      "description": "ARQENIUM's own MCP server: project search, symbol search, structure, dependency graph, impact analysis, run history and traces.",
      "transport": "http",
      "url": "http://127.0.0.1:4321/mcp",
      "category": "Arqenium",
      "template": true,
      "notes": "Enable it in Integrations > Internal server, then register the local URL."
    },
    {
      "id": "filesystem",
      "name": "Filesystem Server",
      "description": "Reference filesystem MCP server exposing read-only access to explicitly allowed directories.",
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/dir"
      ],
      "category": "Files",
      "template": false,
      "notes": "Requires network access to the npm registry the first time it runs."
    },
    {
      "id": "git",
      "name": "Git Server",
      "description": "Read-only git inspection: log, diff, status and branch information over MCP.",
      "transport": "stdio",
      "command": "uvx",
      "args": [
        "mcp-server-git",
        "--repository",
        "/path/to/repo"
      ],
      "category": "Version control",
      "template": false,
      "notes": "Requires uv/uvx. Verify the package before running it against a repository you care about."
    },
    {
      "id": "sqlite",
      "name": "SQLite Server",
      "description": "Query a local SQLite database with read-only SQL over MCP.",
      "transport": "stdio",
      "command": "uvx",
      "args": [
        "mcp-server-sqlite",
        "--db-path",
        "/path/to/db.sqlite"
      ],
      "category": "Data",
      "template": false
    },
    {
      "id": "fetch",
      "name": "Fetch Server",
      "description": "Fetch a URL and convert its content to markdown for model consumption.",
      "transport": "stdio",
      "command": "uvx",
      "args": [
        "mcp-server-fetch"
      ],
      "category": "Web",
      "template": false,
      "notes": "Network access is granted to the server process; treat fetched content as untrusted data."
    },
    {
      "id": "custom-http",
      "name": "Custom HTTP Server",
      "description": "Any MCP server reachable over the Streamable HTTP transport, including remote hosted servers.",
      "transport": "http",
      "url": "https://example.com/mcp",
      "category": "Custom",
      "template": true,
      "notes": "Header values may reference a stored credential with the \"cred:<name>\" syntax."
    },
    {
      "id": "custom-stdio",
      "name": "Custom stdio Server",
      "description": "Any MCP server launched as a local child process over stdio.",
      "transport": "stdio",
      "command": "node",
      "args": [
        "/path/to/server.js"
      ],
      "category": "Custom",
      "template": true,
      "notes": "The child process inherits a filtered environment; provider credentials are never forwarded."
    }
  ],
  "mcp.internal.status": {
    "enabled": false,
    "running": false,
    "port": 4321,
    "url": null,
    "toolCount": 0,
    "lastError": null
  },
  "terminal.sessions": [],
  "terminal.history": [],
  "terminal.explain": {
    "command": "git status",
    "argv": [
      "git",
      "status"
    ],
    "explanation": "Runs version control system. Subcommand \"status\": shows working tree status (read-only). No elevated risk signals were detected by the static policy. Overall risk: low. A human approval is required before this command runs.",
    "risk": "low",
    "riskReasons": [],
    "blocked": false
  },
  "settings.list": [
    {
      "key": "tracex.retentionDays",
      "value": 30
    }
  ],
  "credentials.list": [],
  "context.list": [],
  "rebuild.captures": []
};
