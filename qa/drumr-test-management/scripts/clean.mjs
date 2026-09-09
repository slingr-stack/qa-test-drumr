// Removes the dist/ output directory before a clean build.
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(rootDir, 'dist');

await rm(distDir, { recursive: true, force: true });
console.log(`  removed  dist/`);