import * as path from 'node:path';
import fsp from 'node:fs/promises';

export interface TestManagerPaths {
  appRoot: string;
  testManagerRoot: string;
}

export function getBackendPath(cwd: string = process.cwd()): string {
  return path.join(cwd, 'backend');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function hasDrumrFramework(cwd: string = process.cwd()): Promise<boolean> {
  const backendPath = getBackendPath(cwd);
  const packageJsonPath = path.join(backendPath, 'package.json');

  if (!(await pathExists(packageJsonPath))) {
    return false;
  }

  const content = await fsp.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);
  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};

  return !!deps['@drumr/framework-backend'] || !!devDeps['@drumr/framework-backend'];
}

export async function resolveTestManagerPaths(qaRoot: string = process.cwd()): Promise<TestManagerPaths | null> {
  const workspaceRoot = path.resolve(qaRoot, '..');
  const testManagerRoot = path.join(qaRoot, 'drumr-test-management');

  if (await hasDrumrFramework(workspaceRoot)) {
    return { appRoot: workspaceRoot, testManagerRoot };
  }

  const entries = await fsp.readdir(workspaceRoot, { withFileTypes: true });
  const applicationRoots = await Promise.all(
    entries
      .filter(entry => entry.isDirectory() && entry.name !== 'qa')
      .map(async entry => {
        const candidate = path.join(workspaceRoot, entry.name);
        return (await hasDrumrFramework(candidate)) ? candidate : null;
      }),
  );
  const appRoot = applicationRoots.filter((candidate): candidate is string => candidate !== null);

  return appRoot.length === 1 ? { appRoot: appRoot[0], testManagerRoot } : null;
}

export async function getFrameworkPath(cwd: string = process.cwd()): Promise<string | null> {
  const backendPath = getBackendPath(cwd);

  const candidates = [
    path.join(backendPath, 'node_modules', '@drumr', 'framework-backend'),
    path.join(cwd, 'node_modules', '@drumr', 'framework-backend'),
  ];

  for (const frameworkPath of candidates) {
    if (!(await pathExists(frameworkPath))) {
      continue;
    }

    const stats = await fsp.lstat(frameworkPath);
    if (stats.isSymbolicLink()) {
      return await fsp.realpath(frameworkPath);
    }

    return frameworkPath;
  }

  return null;
}
