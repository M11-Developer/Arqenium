import path from 'node:path';

/** Directories never indexed (dependencies, VCS, build output, caches). */
export const DEFAULT_IGNORE_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.mypy_cache/**',
  '**/.pytest_cache/**',
  '**/.ruff_cache/**',
  '**/vendor/**',
  '**/target/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/.arqenium-data/**',
  '**/release/**',
  '**/.gradle/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/*.pyc',
  '**/*.pyo',
  '**/*.o',
  '**/*.a',
  '**/*.so',
  '**/*.dylib',
  '**/*.dll',
  '**/*.exe',
  '**/*.wasm',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/poetry.lock',
  '**/Cargo.lock',
  '**/*.tsbuildinfo',
];

/** Credential-like files that are never indexed unless explicitly allow-listed. */
export const SENSITIVE_PATTERNS: string[] = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.ppk',
  '**/id_rsa',
  '**/id_rsa.*',
  '**/id_ed25519',
  '**/id_ed25519.*',
  '**/.npmrc',
  '**/.netrc',
  '**/.git-credentials',
  '**/.htpasswd',
  '**/.pgpass',
  '**/credentials',
  '**/credentials.json',
  '**/secrets.json',
  '**/secrets.*',
  '**/service-account*.json',
  '**/.aws/credentials',
  '**/*.keystore',
  '**/*.jks',
];

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war',
  'class', 'pyc', 'pyo', 'wasm', 'bin', 'dat', 'db', 'sqlite', 'sqlite3',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'ogg', 'flac',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'exe', 'dll', 'so', 'dylib', 'o', 'a', 'obj', 'lib',
  'ics', 'vcf', 'iso', 'img', 'dmg', 'app',
]);

export function isBinaryExt(relPath: string): boolean {
  const ext = path.extname(relPath).slice(1).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/** Compile a glob-lite pattern (**, *, ?) into an anchored RegExp. */
export function globToRegExp(pattern: string): RegExp {
  let re = '';
  let i = 0;
  const p = pattern.replace(/\\/g, '/');
  while (i < p.length) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        // '**/' matches zero or more directories; '**' at end matches everything below
        if (p[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if ('+.^$()|{}[]'.includes(c)) {
      re += `\\${c}`;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

export class IgnoreMatcher {
  private ignore: RegExp[];
  private allow: RegExp[];
  private sensitive: RegExp[];

  constructor(extraIgnore: string[] = [], allow: string[] = []) {
    this.ignore = [...DEFAULT_IGNORE_PATTERNS, ...extraIgnore].map(globToRegExp);
    this.sensitive = SENSITIVE_PATTERNS.map(globToRegExp);
    this.allow = allow.map(globToRegExp);
  }

  /** Matches ignore rules (dependency dirs, build output, generated files). */
  isIgnored(relPath: string): boolean {
    const p = relPath.replace(/\\/g, '/');
    return this.ignore.some((re) => re.test(p));
  }

  /** Matches credential-like paths blocked by the security policy. */
  isSensitive(relPath: string): boolean {
    const p = relPath.replace(/\\/g, '/');
    if (this.allow.some((re) => re.test(p))) return false;
    return this.sensitive.some((re) => re.test(p));
  }

  /** True when the file must not be indexed or read. */
  isBlocked(relPath: string): boolean {
    return this.isIgnored(relPath) || this.isSensitive(relPath);
  }
}
