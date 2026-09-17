import * as path from 'node:path';

export const APP_ROOT_ENV = 'DRUMR_TEST_MANAGER_APP_ROOT';
export const BACKEND_TESTS_DIR_ENV = 'DRUMR_TEST_MANAGER_BACKEND_TESTS_DIR';
export const FRONTEND_TESTS_DIR_ENV = 'DRUMR_TEST_MANAGER_FRONTEND_TESTS_DIR';

export interface TestManagerPaths {
  appRoot: string;
  testManagerRoot: string;
}

export async function resolveTestManagerPaths(qaRoot: string = process.cwd()): Promise<TestManagerPaths | null> {
  const resolvedQaRoot = path.resolve(qaRoot);
  const configuredAppRoot = process.env[APP_ROOT_ENV];
  const appRoot = configuredAppRoot
    ? path.resolve(resolvedQaRoot, configuredAppRoot)
    : path.resolve(resolvedQaRoot, '..');
  const testManagerRoot = path.join(qaRoot, 'drumr-test-management');

  // Test Manager is useful for any application layout. Test directories are
  // resolved by the collector and are allowed to be absent.
  return { appRoot, testManagerRoot: path.resolve(testManagerRoot) };
}

