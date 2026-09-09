// Copies non-TypeScript assets (e.g. UI templates) into the dist/ output.
// tsc does not copy assets, so the web UI index.html must be synced manually.
// Also ensures the CLI bin has the executable bit set (umask/loss on copy).
import { mkdir, cp, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// 1) Copy UI templates so the server can resolve index.html at runtime.
const sourceTemplates = path.join(rootDir, 'cli', 'templates');
const destTemplates = path.join(rootDir, 'dist', 'cli', 'templates');
await mkdir(destTemplates, { recursive: true });
await cp(sourceTemplates, destTemplates, { recursive: true, force: true });
console.log('  copied  cli/templates → dist/cli/templates');

// 2) Ensure the CLI bin is executable after tsc emits it.
const binPath = path.join(rootDir, 'dist', 'cli', 'bin', 'test-manager.js');
await chmod(binPath, 0o755);
console.log(`  chmod    +x dist/cli/bin/test-manager.js`);