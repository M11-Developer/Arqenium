#!/usr/bin/env node
/**
 * Print a SHA-256 manifest for the release artifacts.
 *
 * Used by the Windows release job so a download can be verified before running
 * an unsigned installer. Reads every path given on the command line.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

async function sha256(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', resolve)
      .on('error', reject);
  });
  return hash.digest('hex');
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: checksums.mjs <file> [file...]');
  process.exit(1);
}

for (const file of files) {
  const info = await stat(file);
  if (!info.isFile()) continue;
  console.log(`${await sha256(file)}  ${path.basename(file)}`);
}
