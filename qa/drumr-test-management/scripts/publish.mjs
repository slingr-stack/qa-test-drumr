#!/usr/bin/env node
/**
 * Builds and publishes the package to the Drumr Artifact Registry on GCP.
 *
 * A short-lived access token is obtained from the active `gcloud` account and
 * written to a temporary npm config file, so no credentials are ever stored in
 * the repository. The token is valid for roughly one hour, which is ample for a
 * single publish.
 *
 * Usage:
 *   node scripts/publish.mjs [--tag <dist-tag>] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const REGISTRY_HOST = 'us-central1-npm.pkg.dev';
const REGISTRY_PATH = 'slingr-qa/drumr-npm';
const REGISTRY = `https://${REGISTRY_HOST}/${REGISTRY_PATH}/`;

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : undefined;
}

function run(command, args, extraEnv = {}) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

function resolveDistTag() {
  const explicit = readFlag('--tag');
  if (explicit) {
    return explicit;
  }

  const packageJson = JSON.parse(
    execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], {
      cwd: rootDir,
      encoding: 'utf-8',
    }),
  );

  // Prerelease versions must not land on the `latest` tag.
  return /-(beta|alpha|rc)\./.test(packageJson.version) ? 'beta' : 'latest';
}

function createTempNpmrc(token) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'drumr-npmrc-'));
  const npmrcPath = path.join(dir, '.npmrc');
  writeFileSync(
    npmrcPath,
    [
      `@drumr:registry=${REGISTRY}`,
      `//${REGISTRY_HOST}/${REGISTRY_PATH}/:_authToken=${token}`,
      `//${REGISTRY_HOST}/${REGISTRY_PATH}/:always-auth=true`,
      '',
    ].join('\n'),
    'utf-8',
  );
  return { dir, npmrcPath };
}

const dryRun = process.argv.includes('--dry-run');
const tag = resolveDistTag();

console.log(`Publishing to ${REGISTRY} (tag: ${tag}${dryRun ? ', dry run' : ''})`);

console.log('\n> building');
run('pnpm', ['run', 'build']);

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf-8' }).trim();
if (!token) {
  console.error('Could not obtain a GCP access token. Run: gcloud auth login');
  process.exit(1);
}

const { dir, npmrcPath } = createTempNpmrc(token);

try {
  console.log('\n> publishing');
  const args = ['publish', '--no-git-checks', '--registry', REGISTRY, '--tag', tag];
  if (dryRun) {
    args.push('--dry-run');
  }

  run('pnpm', args, { NPM_CONFIG_USERCONFIG: npmrcPath });
  console.log(`\nPublished @drumr/test-management with dist-tag "${tag}".`);
  console.log(`Consumers install with: pnpm add @drumr/test-management${tag === 'latest' ? '' : `@${tag}`}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
