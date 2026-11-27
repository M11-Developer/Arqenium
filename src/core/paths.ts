import fs from 'node:fs';
import path from 'node:path';

/**
 * Windows/macOS filesystems are case-insensitive and use `\` as the separator,
 * so a plain `candidate.startsWith(root + path.sep)` check is both too strict
 * (a correctly-contained path with different casing is rejected) and unsafe on
 * its own (a sibling directory named `<root>-evil` would pass a naive prefix
 * test). Every containment check in the app goes through this helper instead.
 */
const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

function fold(p: string): string {
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}

/**
 * Both sides are compared in their real (long) form.
 *
 * Windows accepts short 8.3 names for the same directory - `C:\Users\RUNNER~1`
 * and `C:\Users\runneradmin` are one folder - and a caller may hold one while
 * the project stores the other. `isInside` resolves first so two spellings of
 * the same location compare equal. Resolution is best-effort: paths that do not
 * exist (which is exactly when containment matters most) fall back to their
 * lexical form and are still checked.
 */
function real(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}

/** True when `candidate` is `root` itself or lives inside it. */
export function isInside(root: string, candidate: string): boolean {
  const a = fold(path.resolve(real(root)));
  const b = fold(path.resolve(real(candidate)));
  if (b === a) return true;
  return b.startsWith(a.endsWith(path.sep) ? a : a + path.sep);
}

/**
 * Assert that `candidate` is inside `root`, returning the resolved path.
 * Throws a message the API layer maps to `not_permitted` (HTTP 403).
 */
export function assertInside(root: string, candidate: string, message = 'Path escapes the project root'): string {
  const resolved = path.resolve(candidate);
  if (!isInside(root, resolved)) throw new Error(message);
  return resolved;
}

/**
 * Normalise a path that arrived from the renderer (or a config file) into the
 * forward-slash form the index, ignore matcher and database all store.
 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * A project-relative path in POSIX form, or an empty string when the file is
 * outside the project (used by the watcher and the indexer).
 */
export function relativePosix(root: string, abs: string): string {
  return toPosix(path.relative(root, abs));
}
