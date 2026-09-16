import fsp from 'node:fs/promises';
import path from 'node:path';

import { resolveTestManagerPaths } from '../../utils/checkFramework.js';
import { TEST_PLANS_KEY } from '../../utils/testRunState.js';
import { createStorageAdapter } from '../../utils/storage/index.js';

const DEFAULT_TEST_PLANS: object = {
  plans: [],
  caseFolders: [],
};

const TEST_MANAGEMENT_DIR = 'testsManagement';

const E2E_DIRS = [
  'frontend/tests/e2e',
  'frontend/tests/e2e/fixtures',
  'frontend/tests/e2e/helpers',
];

const UNIT_DIRS = [
  'backend/tests/unit',
];

const INTEGRATION_DIRS = [
  'backend/tests/integration',
];

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function setupTests(cwd: string = process.cwd()): Promise<void> {
  const paths = await resolveTestManagerPaths(cwd);

  if (!paths) {
    console.error(
      'Could not find exactly one Drumr application next to the qa directory.\n' +
        'Run this command from an application\'s qa directory.',
    );
    process.exit(1);
  }

  const { testManagerRoot } = paths;

  const allDirs = [TEST_MANAGEMENT_DIR, ...E2E_DIRS, ...UNIT_DIRS, ...INTEGRATION_DIRS];
  let directoriesCreated = 0;

  for (const dir of allDirs) {
    const abs = path.join(testManagerRoot, dir);
    if (!(await pathExists(abs))) {
      await fsp.mkdir(abs, { recursive: true });
      console.log(`  created  drumr-test-management/${dir}/`);
      directoriesCreated++;
    }
  }

  const storage = await createStorageAdapter(testManagerRoot);

  if (await storage.exists(TEST_PLANS_KEY)) {
    console.log(`  exists   ${TEST_PLANS_KEY} (skipped)`);
  } else {
    await storage.writeText(TEST_PLANS_KEY, JSON.stringify(DEFAULT_TEST_PLANS, null, 2));
    console.log(`  created  ${TEST_PLANS_KEY}`);
  }

  const summary = directoriesCreated > 0
    ? `Created ${directoriesCreated} director${directoriesCreated === 1 ? 'y' : 'ies'}.`
    : 'All directories already exist.';

  console.log(`\nTest infrastructure ready. ${summary}`);
  console.log(`State storage: ${storage.kind}`);
  console.log('Run "drumr tests open" to launch the Test Manager UI.');
  await storage.close();
}
