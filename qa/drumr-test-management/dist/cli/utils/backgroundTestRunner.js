"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const promises_1 = __importDefault(require("node:fs/promises"));
const testResultParser_1 = require("./testResultParser");
const testRunState_1 = require("./testRunState");
const index_js_1 = require("./storage/index.js");
async function pathExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Serializes log appends so chunks never interleave, and isolates failures:
 * losing a log line must never abort a running test execution.
 */
function createLogWriter(storage, logKey) {
    let chain = Promise.resolve();
    return (text) => {
        chain = chain
            .then(() => storage.appendText(logKey, text))
            .catch(() => undefined);
        return chain;
    };
}
function buildCaseMatcher(command) {
    return Object.fromEntries(Object.entries({
        caseId: command.caseId,
        specFile: command.specFile,
        testName: command.testName,
        fullName: command.fullName,
    }).filter(([, value]) => value !== undefined));
}
function buildCasePatch(patch) {
    return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
function buildResultMatcher(command) {
    return Object.fromEntries(Object.entries({
        fullName: command.fullName,
        testName: command.testName,
    }).filter(([, value]) => value !== undefined));
}
function formatCommand(command) {
    return [command.executable, ...command.args].join(' ');
}
async function executeCommand(storage, payload, command, writeLog) {
    const startedAt = new Date().toISOString();
    await (0, testRunState_1.updateRunCase)(storage, payload.runId, buildCaseMatcher(command), buildCasePatch({ startedAt }));
    await writeLog(`\n[case] ${command.label}\n`);
    await writeLog(`[cwd] ${command.cwd}\n`);
    await writeLog(`$ ${formatCommand(command)}\n`);
    await promises_1.default.rm(command.resultFilePath, { recursive: true, force: true });
    return new Promise(resolve => {
        const child = (0, node_child_process_1.spawn)(command.executable, command.args, {
            cwd: command.cwd,
            env: { ...process.env, ...(command.env ?? {}) },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
        });
        child.stdout?.on('data', chunk => void writeLog(String(chunk)));
        child.stderr?.on('data', chunk => void writeLog(String(chunk)));
        child.once('error', async (error) => {
            await writeLog(`\n[error] ${error.message}\n`);
            await (0, testRunState_1.updateRunCase)(storage, payload.runId, buildCaseMatcher(command), {
                status: 'failed',
                finishedAt: new Date().toISOString(),
                error: error.message,
            });
            resolve({ exitCode: 1, status: 'failed' });
        });
        child.once('close', async (code) => {
            const exitCode = code ?? 1;
            await writeLog(`\n[exit] ${exitCode}\n`);
            let status = null;
            if (command.parser === 'jest') {
                status = await (0, testResultParser_1.readJestCaseStatus)(command.resultFilePath, buildResultMatcher(command));
            }
            else {
                status = await (0, testResultParser_1.readPlaywrightCaseStatus)(command.resultFilePath, buildResultMatcher(command));
            }
            const finalStatus = status ?? (exitCode === 0 ? 'passed' : 'failed');
            await (0, testRunState_1.updateRunCase)(storage, payload.runId, buildCaseMatcher(command), buildCasePatch({
                status: finalStatus,
                finishedAt: new Date().toISOString(),
                error: exitCode === 0 ? undefined : `Command exited with code ${exitCode}`,
            }));
            resolve({ exitCode, status: finalStatus });
        });
    });
}
async function run() {
    const payloadPath = process.argv[2];
    if (!payloadPath) {
        throw new Error('Missing background test runner payload path.');
    }
    const payloadContent = await promises_1.default.readFile(payloadPath, 'utf-8');
    const payload = JSON.parse(payloadContent);
    const storage = await (0, index_js_1.createStorageAdapter)(payload.appRoot);
    const writeLog = createLogWriter(storage, (0, testRunState_1.getRunLogKey)(payload.runId));
    let exitCode = 0;
    await (0, testRunState_1.updateRunLifecycle)(storage, payload.runId, 'running', { startedAt: new Date().toISOString() });
    await writeLog(`[run] ${payload.label}\n`);
    await writeLog(`[id] ${payload.runId}\n`);
    await writeLog(`[startedAt] ${new Date().toISOString()}\n`);
    try {
        for (const command of payload.commands) {
            const commandResult = await executeCommand(storage, payload, command, writeLog);
            if (commandResult.exitCode !== 0) {
                exitCode = commandResult.exitCode;
            }
        }
        await writeLog(`\n[finishedAt] ${new Date().toISOString()}\n`);
        await writeLog(`[result] ${exitCode === 0 ? 'success' : 'failed'}\n`);
        await (0, testRunState_1.updateRunLifecycle)(storage, payload.runId, exitCode === 0 ? 'completed' : 'failed', { finishedAt: new Date().toISOString() });
    }
    finally {
        // Await the pending chain so buffered log writes flush before exit.
        await writeLog('');
        await storage.close();
        await promises_1.default.rm(payloadPath, { recursive: true, force: true });
    }
    process.exit(exitCode);
}
void run().catch(async (error) => {
    const payloadPath = process.argv[2];
    if (payloadPath && (await pathExists(payloadPath))) {
        const payloadContent = await promises_1.default.readFile(payloadPath, 'utf-8');
        const payload = JSON.parse(payloadContent);
        const storage = await (0, index_js_1.createStorageAdapter)(payload.appRoot);
        const writeLog = createLogWriter(storage, (0, testRunState_1.getRunLogKey)(payload.runId));
        await writeLog(`[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
        await (0, testRunState_1.updateRunLifecycle)(storage, payload.runId, 'failed', {
            finishedAt: new Date().toISOString(),
        });
        await storage.close();
        await promises_1.default.rm(payloadPath, { recursive: true, force: true });
    }
    process.exit(1);
});
//# sourceMappingURL=backgroundTestRunner.js.map