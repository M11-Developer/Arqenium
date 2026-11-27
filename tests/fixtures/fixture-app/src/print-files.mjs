// Lists this directory using only Node builtins, so the EchoShell end-to-end
// test can assert real command output on every platform (`ls` does not exist on
// Windows, where the equivalent is `dir`).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
for (const entry of readdirSync(here).sort()) process.stdout.write(`${entry}\n`);
