#!/usr/bin/env node
/**
 * Turn a vitest log into GitHub annotations.
 *
 * The raw log is only available as a downloadable artifact; annotations are
 * visible from the run page and from `gh run view`, which is what makes a
 * Windows-only failure diagnosable without fetching anything.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'test-output.log';
let log = '';
try {
  log = readFileSync(file, 'utf8');
} catch {
  console.log('::error::no test log was produced');
  process.exit(0);
}

const lines = log.split(/\r?\n/);
const failures = lines
  .filter((l) => /^\s*(?:×|✗|FAIL)\s/.test(l) || /^\s*FAIL\s+\S+\.test\.ts/.test(l))
  .map((l) => l.replace(/^\s*(?:×|✗|FAIL)\s*/, '').trim())
  .filter(Boolean);

for (const f of [...new Set(failures)].slice(0, 15)) {
  console.log(`::error title=Test failed::${f.replace(/\r/g, '').slice(0, 400)}`);
}

// The assertion text usually sits a few lines below the test name.
const assertion = lines.find((l) => /AssertionError|Error: expected|TypeError:|ReferenceError:/.test(l));
if (assertion) console.log(`::error title=Assertion::${assertion.trim().slice(0, 400)}`);

if (failures.length === 0) {
  const tail = lines.slice(-12).join(' | ');
  console.log(`::error title=Test step failed::${tail.slice(0, 600)}`);
}
