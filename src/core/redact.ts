/**
 * Redaction layer. Applied to every event payload before persistence and to
 * outbound log lines. Removes values that look like credentials and masks
 * well-known secret-bearing keys.
 */

const SENSITIVE_KEY = /(api[-_]?key|apikey|authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|secret|password|passwd|credential|private[-_]?key|session[-_]?id|cookie|signature|bearer)/i;

const VALUE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsk-[A-Za-z0-9_-]{16,}/g, label: 'sk-***' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g, label: 'sk-ant-***' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{16,}/g, label: 'gh*_***' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{16,}/g, label: 'github_pat_***' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AKIA***' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, label: 'xox*-***' },
  { re: /\bAIza[0-9A-Za-z_-]{20,}/g, label: 'AIza***' },
  { re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, label: 'Bearer ***' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, label: '[PRIVATE KEY REDACTED]' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'eyJ*.***' },
];

export function maskSecret(value: string): string {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`;
}

/** Redact a single string value. */
export function redactString(input: string): string {
  let out = input;
  for (const { re, label } of VALUE_PATTERNS) {
    out = out.replace(re, label);
  }
  return out;
}

/**
 * Deep-redacts objects/arrays. Secret-looking keys are replaced with
 * "[redacted]"; strings are scanned for credential patterns.
 */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 12) return '[depth-limit]' as unknown as T;
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value) as unknown as T;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as unknown as T;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message), stack: redactString(value.stack ?? '') } as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redactDeep(v, depth + 1);
      }
    }
    return out as unknown as T;
  }
  return value;
}

/** Environment filter: never forward secret-looking variables to child processes. */
export function filterEnv(env: NodeJS.ProcessEnv, extraDeny: string[] = []): NodeJS.ProcessEnv {
  const deny = [/KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|PRIVATE/i, ...extraDeny.map((n) => new RegExp(n, 'i'))];
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (v == null) continue;
    if (deny.some((re) => re.test(k))) continue;
    out[k] = v;
  }
  return out;
}
