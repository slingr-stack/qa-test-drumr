"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTests = setupTests;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const checkFramework_js_1 = require("../../utils/checkFramework.js");
const testRunState_js_1 = require("../../utils/testRunState.js");
const index_js_1 = require("../../utils/storage/index.js");
const DEFAULT_TEST_PLANS = {
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
async function pathExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function setupTests(cwd = process.cwd()) {
    const paths = await (0, checkFramework_js_1.resolveTestManagerPaths)(cwd);
    if (!paths) {
        console.error('Could not resolve the application root for Test Manager.');
        process.exit(1);
    }
    const { testManagerRoot } = paths;
    const allDirs = [TEST_MANAGEMENT_DIR, ...E2E_DIRS, ...UNIT_DIRS, ...INTEGRATION_DIRS];
    let directoriesCreated = 0;
    for (const dir of allDirs) {
        const abs = node_path_1.default.join(testManagerRoot, dir);
        if (!(await pathExists(abs))) {
            await promises_1.default.mkdir(abs, { recursive: true });
            console.log(`  created  drumr-test-management/${dir}/`);
            directoriesCreated++;
        }
    }
    const storage = await (0, index_js_1.createStorageAdapter)(testManagerRoot);
    if (await storage.exists(testRunState_js_1.TEST_PLANS_KEY)) {
        console.log(`  exists   ${testRunState_js_1.TEST_PLANS_KEY} (skipped)`);
    }
    else {
        await storage.writeText(testRunState_js_1.TEST_PLANS_KEY, JSON.stringify(DEFAULT_TEST_PLANS, null, 2));
        console.log(`  created  ${testRunState_js_1.TEST_PLANS_KEY}`);
    }
    const summary = directoriesCreated > 0
        ? `Created ${directoriesCreated} director${directoriesCreated === 1 ? 'y' : 'ies'}.`
        : 'All directories already exist.';
    console.log(`\nTest infrastructure ready. ${summary}`);
    console.log(`State storage: ${storage.kind}`);
    console.log('Run "drumr tests open" to launch the Test Manager UI.');
    await storage.close();
}
//# sourceMappingURL=setup.js.map