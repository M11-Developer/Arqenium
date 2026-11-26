import type { ParseQuality, SymbolKind } from '../../../shared/types';

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  endLine: number;
  signature: string;
  container: string | null;
  exported: boolean;
}

export interface ParsedImport {
  moduleSpec: string;
  kind: 'import' | 'require' | 'dynamic-import';
  line: number;
}

export interface FileParseResult {
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  quality: ParseQuality;
  error?: string;
}

/**
 * Language adapters are pluggable: the indexer only knows this interface, so
 * new languages can be added without touching the indexing pipeline. Languages
 * that are not implemented report unavailable and are indexed as plain files.
 */
export interface LanguageAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly extensions: string[];
  isAvailable(): boolean;
  parseBatch(files: Array<{ path: string; source: string }>): Promise<FileParseResult[]>;
}
