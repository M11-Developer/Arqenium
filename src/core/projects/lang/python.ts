import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FileParseResult, LanguageAdapter } from './types';

const execFileP = promisify(execFile);

/**
 * Embedded Python extractor run through the local `python3` interpreter using
 * the standard library `ast` module - a real parse, not regex matching. When
 * no interpreter is available the adapter reports unavailable and files are
 * indexed with quality "none" (clearly surfaced in the UI).
 */
const PYTHON_EXTRACTOR = String.raw`
import ast, json, sys

def pos(node):
    return (node.lineno, getattr(node, 'end_lineno', node.lineno) or node.lineno)

def sig(node):
    try:
        src = ast.get_source_segment(SOURCE, node) or ''
    except Exception:
        src = ''
    line = src.split('\n')[0] if src else ''
    return line[:240]

def collect(tree, out_symbols, out_imports, container=None):
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.ImportFrom):
                mod = ('.' * node.level) + (node.module or '')
                out_imports.append({'moduleSpec': mod, 'kind': 'import', 'line': node.lineno})
                for alias in node.names:
                    if alias.name != '*':
                        out_symbols.append({'name': alias.asname or alias.name, 'kind': 'variable',
                            'line': node.lineno, 'endLine': getattr(node, 'end_lineno', node.lineno) or node.lineno,
                            'signature': f'from {mod} import {alias.name}', 'container': container, 'exported': False})
            else:
                for alias in node.names:
                    out_imports.append({'moduleSpec': alias.name, 'kind': 'import', 'line': node.lineno})
            continue
        if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
            out_symbols.append({'name': node.name, 'kind': 'function', 'line': node.lineno,
                'endLine': getattr(node, 'end_lineno', node.lineno) or node.lineno,
                'signature': sig(node), 'container': container, 'exported': container is None})
            for dec in node.decorator_list:
                collect_expr_imports(dec, out_imports, node.lineno)
            continue
        if isinstance(node, ast.ClassDef):
            out_symbols.append({'name': node.name, 'kind': 'class', 'line': node.lineno,
                'endLine': getattr(node, 'end_lineno', node.lineno) or node.lineno,
                'signature': sig(node), 'container': container, 'exported': container is None})
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    kind = 'method' if item.name != '__init__' else 'method'
                    out_symbols.append({'name': item.name, 'kind': kind, 'line': item.lineno,
                        'endLine': getattr(item, 'end_lineno', item.lineno) or item.lineno,
                        'signature': sig(item), 'container': node.name, 'exported': False})
                elif isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    out_symbols.append({'name': item.target.id, 'kind': 'property', 'line': item.lineno,
                        'endLine': getattr(item, 'end_lineno', item.lineno) or item.lineno,
                        'signature': ast.unparse(item) if hasattr(ast, 'unparse') else item.target.id,
                        'container': node.name, 'exported': False})
                elif isinstance(item, ast.Assign):
                    for t in item.targets:
                        if isinstance(t, ast.Name):
                            out_symbols.append({'name': t.id, 'kind': 'property', 'line': item.lineno,
                                'endLine': getattr(item, 'end_lineno', item.lineno) or item.lineno,
                                'signature': ast.unparse(item) if hasattr(ast, 'unparse') else t.id,
                                'container': node.name, 'exported': False})
            continue
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    out_symbols.append({'name': t.id, 'kind': 'variable', 'line': node.lineno,
                        'endLine': getattr(node, 'end_lineno', node.lineno) or node.lineno,
                        'signature': sig(node), 'container': container, 'exported': container is None})
            continue
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            out_symbols.append({'name': node.target.id, 'kind': 'variable', 'line': node.lineno,
                'endLine': getattr(node, 'end_lineno', node.lineno) or node.lineno,
                'signature': sig(node), 'container': container, 'exported': container is None})
            continue
        if isinstance(node, (ast.If, ast.Try, ast.With, ast.For, ast.While)):
            collect(ast.Module(body=node.body, type_ignores=[]), out_symbols, out_imports, container)

def collect_expr_imports(expr, out_imports, line):
    for sub in ast.walk(expr):
        if isinstance(sub, ast.ImportFrom):
            mod = ('.' * sub.level) + (sub.module or '')
            out_imports.append({'moduleSpec': mod, 'kind': 'import', 'line': line})
        elif isinstance(sub, ast.Import):
            for alias in sub.names:
                out_imports.append({'moduleSpec': alias.name, 'kind': 'import', 'line': line})

def main():
    global SOURCE
    # The payload is passed as a file path (argv[1]) so the child never blocks
    # waiting on an inherited stdin.
    with open(sys.argv[1], 'r', encoding='utf-8') as fh:
        payload = json.load(fh)
    results = []
    for item in payload:
        source = item['source']
        SOURCE = source
        symbols, imports = [], []
        try:
            tree = ast.parse(source, filename=item['path'])
            collect(tree, symbols, imports)
            results.append({'symbols': symbols, 'imports': imports, 'quality': 'parsed'})
        except SyntaxError as e:
            results.append({'symbols': [], 'imports': [], 'quality': 'none',
                            'error': f'Python syntax error: {e.msg} at line {e.lineno}'})
        except Exception as e:
            results.append({'symbols': [], 'imports': [], 'quality': 'none', 'error': str(e)})
    json.dump(results, sys.stdout)

main()
`;

let pythonBin: string | null | undefined;

export async function detectPythonBin(): Promise<string | null> {
  if (pythonBin !== undefined) return pythonBin;
  const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  for (const bin of candidates) {
    try {
      await execFileP(bin, ['--version'], { timeout: 5000 });
      pythonBin = bin;
      return pythonBin;
    } catch {
      /* try next */
    }
  }
  pythonBin = null;
  return null;
}

export class PythonAdapter implements LanguageAdapter {
  readonly id = 'python';
  readonly displayName = 'Python';
  readonly extensions = ['.py'];

  /**
   * Synchronous capability flag. The interpreter is probed once by
   * `detectPythonBin()`; until that probe completes this reports false rather
   * than guessing, and `parseBatch` performs the authoritative async check.
   */
  isAvailable(): boolean {
    return pythonBin !== undefined && pythonBin !== null;
  }

  async probe(): Promise<boolean> {
    return (await detectPythonBin()) !== null;
  }

  async parseBatch(files: Array<{ path: string; source: string }>): Promise<FileParseResult[]> {
    if (!files.length) return [];
    const bin = await detectPythonBin();
    if (!bin) {
      return files.map(() => ({
        symbols: [],
        imports: [],
        quality: 'none' as const,
        error: 'Python interpreter not found; file indexed without symbols',
      }));
    }
    const dir = await mkdtemp(path.join(os.tmpdir(), 'arq-py-'));
    try {
      const scriptPath = path.join(dir, 'extract.py');
      await writeFile(scriptPath, PYTHON_EXTRACTOR, 'utf8');
      const inputPath = path.join(dir, 'input.json');
      await writeFile(inputPath, JSON.stringify(files.map((f) => ({ path: f.path, source: f.source }))), 'utf8');
      const { stdout, stderr } = await execFileP(bin, [scriptPath, inputPath], {
        timeout: 60_000,
        maxBuffer: 32 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
      });
      try {
        const parsed = JSON.parse(stdout) as FileParseResult[];
        if (parsed.length === files.length) return parsed;
      } catch {
        /* fall through */
      }
      return files.map(() => ({
        symbols: [],
        imports: [],
        quality: 'none' as const,
        error: `Python extractor failed: ${stderr.slice(0, 300) || 'invalid output'}`,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return files.map(() => ({ symbols: [], imports: [], quality: 'none' as const, error: msg }));
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
