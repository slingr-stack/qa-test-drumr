"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openTests = openTests;
const node_child_process_1 = require("node:child_process");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const checkFramework_js_1 = require("../../utils/checkFramework.js");
const portChecker_js_1 = require("../../utils/portChecker.js");
const testServer_js_1 = require("../../utils/testServer.js");
const index_js_1 = require("../../utils/storage/index.js");
const UI_HTML_PATH = node_path_1.default.join(__dirname, '..', '..', 'templates', 'test-ui', 'index.html');
const TEST_PLANS_PATH = node_path_1.default.join('testsManagement', 'test-plans.json');
const DEFAULT_PORT = 4000;
async function pathExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function openTests(cwd = process.cwd(), options = {}) {
    const { port: requestedPort = DEFAULT_PORT, noOpen = false } = options;
    const paths = await (0, checkFramework_js_1.resolveTestManagerPaths)(cwd);
    if (!paths) {
        console.error('Could not resolve the application root for Test Manager.');
        process.exit(1);
    }
    const { appRoot, testManagerRoot } = paths;
    const testPlansPath = node_path_1.default.join(testManagerRoot, TEST_PLANS_PATH);
    if (!(await pathExists(testPlansPath))) {
        console.error('Required test infrastructure was not found in this application.\n' +
            `Missing file: ${testPlansPath}\n` +
            'Run "drumr tests setup" before using the Test Manager.');
        process.exit(1);
    }
    const port = await (0, portChecker_js_1.findAvailablePort)(requestedPort);
    if (port === null) {
        console.error(`Could not find an available port starting from ${requestedPort}. Please specify one with --port.`);
        process.exit(1);
    }
    if (port !== requestedPort) {
        console.warn(`Port ${requestedPort} is in use. Using port ${port} instead.`);
    }
    const url = `http://localhost:${port}`;
    console.log(`Starting Drumr Test Manager at ${url} ...`);
    const storage = await (0, index_js_1.createStorageAdapter)(testManagerRoot);
    const server = await (0, testServer_js_1.createTestServer)(appRoot, testManagerRoot, port, UI_HTML_PATH, storage);
    if (!noOpen) {
        openBrowser(url);
    }
    console.log(`Test Manager is running at ${url}`);
    console.log(`State storage: ${storage.kind}`);
    console.log('Press Ctrl+C to stop.\n');
    await waitForShutdown(server, () => storage.close());
    console.log('\nTest Manager stopped.');
}
function openBrowser(url) {
    try {
        const platform = process.platform;
        if (platform === 'darwin') {
            (0, node_child_process_1.execSync)(`open "${url}"`, { stdio: 'ignore' });
        }
        else if (platform === 'win32') {
            (0, node_child_process_1.execSync)(`start "" "${url}"`, { stdio: 'ignore' });
        }
        else {
            (0, node_child_process_1.execSync)(`xdg-open "${url}"`, { stdio: 'ignore' });
        }
    }
    catch {
        // Non-fatal
    }
}
function waitForShutdown(server, onShutdown) {
    return new Promise((resolve, reject) => {
        const shutdown = () => {
            process.off('SIGINT', shutdown);
            process.off('SIGTERM', shutdown);
            server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
            // Flush buffered state (relevant for remote storage) without blocking shutdown.
            void onShutdown?.();
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
    });
}
//# sourceMappingURL=open.js.map