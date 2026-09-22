import * as path from 'node:path';
import fsp from 'node:fs/promises';

export const APP_ROOT_ENV = 'DRUMR_TEST_MANAGER_APP_ROOT';
export const BACKEND_TESTS_DIR_ENV = 'DRUMR_TEST_MANAGER_BACKEND_TESTS_DIR';
export const FRONTEND_TESTS_DIR_ENV = 'DRUMR_TEST_MANAGER_FRONTEND_TESTS_DIR';
export const TEST_MANAGER_CONFIG_FILENAME = 'config.json';

export interface TestManagerConfig {
  appRoot?: string;
  backendTestsDir?: string;
  frontendTestsDir?: string;
  environment?: {
    E2E_BASE_URL?: string;
    E2E_API_BASE_URL?: string;
  };
}

export interface TestManagerPaths {
  appRoot: string;
  testManagerRoot: string;
  config: TestManagerConfig;
}

export async function loadTestManagerConfig(testManagerRoot: string): Promise<TestManagerConfig> {
  const configPath = path.join(testManagerRoot, TEST_MANAGER_CONFIG_FILENAME);
  let content: string;

  try {
    content = await fsp.readFile(configPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }

  const config: unknown = JSON.parse(content);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Invalid Test Manager configuration in ${configPath}. Expected a JSON object.`);
  }

  return config as TestManagerConfig;
}

export async function resolveTestManagerPaths(qaRoot: string = process.cwd()): Promise<TestManagerPaths | null> {
  const resolvedQaRoot = path.resolve(qaRoot);
  const testManagerRoot = path.join(resolvedQaRoot, 'drumr-test-management');
  const config = await loadTestManagerConfig(testManagerRoot);
  const configuredAppRoot = process.env[APP_ROOT_ENV] ?? config.appRoot;
  const appRoot = configuredAppRoot
    ? path.resolve(resolvedQaRoot, configuredAppRoot)
    : path.resolve(resolvedQaRoot, '..');

  // Test Manager is useful for any application layout. Test directories are
  // resolved by the collector and are allowed to be absent.
  return { appRoot, testManagerRoot, config };
}

