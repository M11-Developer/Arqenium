import ts from 'typescript';
import type { FileParseResult, LanguageAdapter, ParsedImport, ParsedSymbol } from './types';

const KIND_BY_EXT: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
};

function scriptKindFor(file: string): ts.ScriptKind {
  const idx = file.lastIndexOf('.');
  const ext = idx >= 0 ? file.slice(idx) : '';
  return KIND_BY_EXT[ext] ?? ts.ScriptKind.TS;
}

function isExported(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!mods) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword);
}

function signatureOf(sf: ts.SourceFile, node: ts.Node, nameNode?: ts.Node): string {
  const end = nameNode ? nameNode.getEnd() : Math.min(node.getEnd(), node.getStart(sf) + 200);
  const start = node.getStart(sf);
  const text = sf.text.slice(start, Math.max(start + 1, end));
  const firstLine = text.split('\n')[0];
  return firstLine.length > 240 ? `${firstLine.slice(0, 240)}...` : firstLine;
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

/**
 * TypeScript/JavaScript symbol + import extraction using the TypeScript
 * compiler API (real AST parsing, not regexes).
 */
export class TypeScriptAdapter implements LanguageAdapter {
  readonly id = 'typescript';
  readonly displayName = 'TypeScript / JavaScript';
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  isAvailable(): boolean {
    return true;
  }

  async parseBatch(files: Array<{ path: string; source: string }>): Promise<FileParseResult[]> {
    return files.map((f) => this.parseOne(f.path, f.source));
  }

  private parseOne(file: string, source: string): FileParseResult {
    const symbols: ParsedSymbol[] = [];
    const imports: ParsedImport[] = [];
    try {
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
      if ((sf as any).parseDiagnostics?.length) {
        // Syntax errors do not prevent best-effort extraction; flag quality.
      }

      const addFnLike = (name: string, node: ts.Node, container: string | null, kind: ParsedSymbol['kind']) => {
        symbols.push({
          name,
          kind,
          line: lineOf(sf, node.getStart(sf)),
          endLine: lineOf(sf, Math.max(node.getStart(sf), node.getEnd() - 1)),
          signature: signatureOf(sf, node),
          container,
          exported: isExported(node),
        });
      };

      const visit = (node: ts.Node, container: string | null) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push({ moduleSpec: node.moduleSpecifier.text, kind: 'import', line: lineOf(sf, node.getStart(sf)) });
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push({ moduleSpec: node.moduleSpecifier.text, kind: 'import', line: lineOf(sf, node.getStart(sf)) });
        } else if (ts.isCallExpression(node)) {
          const callee = node.expression;
          const isRequire =
            ts.isIdentifier(callee) && callee.text === 'require' && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]);
          const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]);
          if (isRequire || isDynamicImport) {
            imports.push({
              moduleSpec: (node.arguments[0] as ts.StringLiteral).text,
              kind: isRequire ? 'require' : 'dynamic-import',
              line: lineOf(sf, node.getStart(sf)),
            });
          }
        }

        if (ts.isFunctionDeclaration(node) && node.name) {
          addFnLike(node.name.text, node, container, 'function');
        } else if (ts.isClassDeclaration(node) && node.name) {
          const clsName = node.name.text;
          symbols.push({
            name: clsName,
            kind: 'class',
            line: lineOf(sf, node.getStart(sf)),
            endLine: lineOf(sf, Math.max(node.getStart(sf), node.getEnd() - 1)),
            signature: signatureOf(sf, node, node.name),
            container,
            exported: isExported(node),
          });
          for (const member of node.members) {
            const mname = member.name ? member.name.getText(sf) : '';
            if (!mname) continue;
            const isMethod = ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member);
            const isProp = ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member);
            if (!isMethod && !isProp) continue;
            symbols.push({
              name: isMethod ? mname : mname,
              kind: isMethod ? 'method' : 'property',
              line: lineOf(sf, member.getStart(sf)),
              endLine: lineOf(sf, Math.max(member.getStart(sf), member.getEnd() - 1)),
              signature: signatureOf(sf, member, member.name as ts.Node | undefined),
              container: clsName,
              exported: false,
            });
          }
        } else if (ts.isInterfaceDeclaration(node) && node.name) {
          symbols.push({
            name: node.name.text,
            kind: 'interface',
            line: lineOf(sf, node.getStart(sf)),
            endLine: lineOf(sf, Math.max(node.getStart(sf), node.getEnd() - 1)),
            signature: signatureOf(sf, node, node.name),
            container,
            exported: isExported(node),
          });
        } else if (ts.isTypeAliasDeclaration(node) && node.name) {
          symbols.push({
            name: node.name.text,
            kind: 'type',
            line: lineOf(sf, node.getStart(sf)),
            endLine: lineOf(sf, Math.max(node.getStart(sf), node.getEnd() - 1)),
            signature: signatureOf(sf, node, node.name),
            container,
            exported: isExported(node),
          });
        } else if (ts.isEnumDeclaration(node) && node.name) {
          symbols.push({
            name: node.name.text,
            kind: 'enum',
            line: lineOf(sf, node.getStart(sf)),
            endLine: lineOf(sf, Math.max(node.getStart(sf), node.getEnd() - 1)),
            signature: signatureOf(sf, node, node.name),
            container,
            exported: isExported(node),
          });
        } else if (ts.isModuleDeclaration(node) && node.name && ts.isStringLiteral(node.name)) {
          symbols.push({
            name: node.name.text,
            kind: 'module',
            line: lineOf(sf, node.getStart(sf)),
            endLine: lineOf(sf, Math.max(node.getStart(sf), node.getEnd() - 1)),
            signature: `module ${node.name.text}`,
            container,
            exported: isExported(node),
          });
        } else if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (!ts.isIdentifier(decl.name)) continue;
            const name = decl.name.text;
            const init = decl.initializer;
            const isFn =
              !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
            symbols.push({
              name,
              kind: isFn ? 'function' : 'variable',
              line: lineOf(sf, decl.getStart(sf)),
              endLine: lineOf(sf, Math.max(decl.getStart(sf), decl.getEnd() - 1)),
              signature: signatureOf(sf, node, decl.name),
              container,
              exported: isExported(node),
            });
          }
        }

        let childContainer = container;
        if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
          childContainer = node.name.text;
          symbols.push({
            name: node.name.text,
            kind: 'module',
            line: lineOf(sf, node.getStart(sf)),
            endLine: lineOf(sf, Math.max(node.getStart(sf), node.getEnd() - 1)),
            signature: `namespace ${node.name.text}`,
            container,
            exported: isExported(node),
          });
        }
        ts.forEachChild(node, (child) => visit(child, childContainer));
      };

      // Top level: record container as null; inside namespaces/classes the class handler adds its own children.
      ts.forEachChild(sf, (child) => visit(child, null));

      // Deduplicate identical (name, line, kind)
      const seen = new Set<string>();
      const deduped = symbols.filter((s) => {
        const k = `${s.name}:${s.line}:${s.kind}:${s.container ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      return { symbols: deduped, imports, quality: 'parsed' };
    } catch (err) {
      return {
        symbols: [],
        imports,
        quality: 'none',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
