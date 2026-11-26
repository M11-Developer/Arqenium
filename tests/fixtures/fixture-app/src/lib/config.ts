export interface AppConfig {
  port: number;
  features: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: AppConfig = {
  port: 8080,
  features: ['records'],
  logLevel: 'info',
};

/** Reads configuration from a JSON object; never touches the filesystem. */
export function loadConfig(source: string | Partial<AppConfig> = DEFAULT_CONFIG): AppConfig {
  if (typeof source !== 'string') {
    return { ...DEFAULT_CONFIG, ...source };
  }
  try {
    const parsed = JSON.parse(source) as Partial<AppConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function describeConfig(config: AppConfig): string {
  return `port=${config.port} features=${config.features.join(',')} log=${config.logLevel}`;
}
