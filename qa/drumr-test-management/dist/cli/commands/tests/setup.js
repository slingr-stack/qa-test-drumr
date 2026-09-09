"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTests = setupTests;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const checkFramework_js_1 = require("../../utils/checkFramework.js");
const DEFAULT_TEST_PLANS = {
    plans: [],
    caseFolders: [],
};
const TEST_MANAGEMENT_DIR = 'testsManagement';
const TEST_PLANS_FILE = node_path_1.default.join(TEST_MANAGEMENT_DIR, 'test-plans.json');
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
    if (!(await (0, checkFramework_js_1.hasDrumrFramework)(cwd))) {
        console.error('This directory does not contain a Drumr application.\n' +
            "Run this command from your app's root directory.");
        process.exit(1);
    }
    const allDirs = [TEST_MANAGEMENT_DIR, ...E2E_DIRS, ...UNIT_DIRS, ...INTEGRATION_DIRS];
    let directoriesCreated = 0;
    for (const dir of allDirs) {
        const abs = node_path_1.default.join(cwd, dir);
        if (!(await pathExists(abs))) {
            await promises_1.default.mkdir(abs, { recursive: true });
            console.log(`  created  ${dir}/`);
            directoriesCreated++;
        }
    }
    const testPlansPath = node_path_1.default.join(cwd, TEST_PLANS_FILE);
    if (await pathExists(testPlansPath)) {
        console.log(`  exists   ${node_path_1.default.relative(cwd, testPlansPath)} (skipped)`);
    }
    else {
        await promises_1.default.mkdir(node_path_1.default.dirname(testPlansPath), { recursive: true });
        await promises_1.default.writeFile(testPlansPath, JSON.stringify(DEFAULT_TEST_PLANS, null, 2), 'utf-8');
        console.log(`  created  ${node_path_1.default.relative(cwd, testPlansPath)}`);
    }
    const summary = directoriesCreated > 0
        ? `Created ${directoriesCreated} director${directoriesCreated === 1 ? 'y' : 'ies'}.`
        : 'All directories already exist.';
    console.log(`\nTest infrastructure ready. ${summary}`);
    console.log('Run "drumr tests open" to launch the Test Manager UI.');
}
//# sourceMappingURL=setup.js.map