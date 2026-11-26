import { PythonAdapter } from './python';
import { TypeScriptAdapter } from './typescript';
import type { LanguageAdapter } from './types';

/**
 * Registry of implemented language adapters. Languages without an adapter are
 * still indexed as files for search, but symbol extraction is reported as
 * unsupported - never faked.
 */
export class LanguageRegistry {
  private adapters: LanguageAdapter[] = [];
  private byExt = new Map<string, LanguageAdapter>();

  constructor() {
    this.register(new TypeScriptAdapter());
    this.register(new PythonAdapter());
  }

  /** Probe every adapter that needs an external interpreter. */
  async hydrate(): Promise<void> {
    for (const a of this.adapters) {
      if (a instanceof PythonAdapter) await a.probe();
    }
  }

  register(adapter: LanguageAdapter): void {
    this.adapters.push(adapter);
    for (const ext of adapter.extensions) this.byExt.set(ext, adapter);
  }

  forPath(filePath: string): LanguageAdapter | null {
    const idx = filePath.lastIndexOf('.');
    if (idx < 0) return null;
    return this.byExt.get(filePath.slice(idx).toLowerCase()) ?? null;
  }

  all(): LanguageAdapter[] {
    return [...this.adapters];
  }

  /** Human-readable capability report for the UI. */
  report(): Array<{ id: string; displayName: string; extensions: string[]; available: boolean; note?: string }> {
    return this.adapters.map((a) => {
      const available = a.isAvailable();
      return {
        id: a.id,
        displayName: a.displayName,
        extensions: a.extensions,
        available,
        note: available ? undefined : 'Interpreter not found - files indexed without symbol extraction',
      };
    });
  }
}
