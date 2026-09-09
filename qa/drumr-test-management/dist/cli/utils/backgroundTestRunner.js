"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const testResultParser_1 = require("./testResultParser");
const testRunState_1 = require("./testRunState");
async function pathExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
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
async function executeCommand(payload, command, stream) {
    const startedAt = new Date().toISOString();
    await (0, testRunState_1.updateRunCase)(payload.appRoot, payload.runId, buildCaseMatcher(command), buildCasePatch({ startedAt }));
    stream.write(`\n[case] ${command.label}\n`);
    stream.write(`[cwd] ${command.cwd}\n`);
    stream.write(`$ ${formatCommand(command)}\n`);
    await promises_1.default.rm(command.resultFilePath, { recursive: true, force: true });
    return new Promise(resolve => {
        const child = (0, node_child_process_1.spawn)(command.executable, command.args, {
            cwd: command.cwd,
            env: { ...process.env, ...(command.env ?? {}) },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
        });
        child.stdout?.on('data', chunk => stream.write(chunk));
        child.stderr?.on('data', chunk => stream.write(chunk));
        child.once('error', async (error) => {
            stream.write(`\n[error] ${error.message}\n`);
            await (0, testRunState_1.updateRunCase)(payload.appRoot, payload.runId, buildCaseMatcher(command), {
                status: 'failed',
                finishedAt: new Date().toISOString(),
                error: error.message,
            });
            resolve({ exitCode: 1, status: 'failed' });
        });
        child.once('close', async (code) => {
            const exitCode = code ?? 1;
            stream.write(`\n[exit] ${exitCode}\n`);
            let status = null;
            if (command.parser === 'jest') {
                status = await (0, testResultParser_1.readJestCaseStatus)(command.resultFilePath, buildResultMatcher(command));
            }
            else {
                status = await (0, testResultParser_1.readPlaywrightCaseStatus)(command.resultFilePath, buildResultMatcher(command));
            }
            const finalStatus = status ?? (exitCode === 0 ? 'passed' : 'failed');
            await (0, testRunState_1.updateRunCase)(payload.appRoot, payload.runId, buildCaseMatcher(command), buildCasePatch({
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
    await promises_1.default.mkdir(node_path_1.default.dirname(payload.logFilePath), { recursive: true });
    const stream = node_fs_1.default.createWriteStream(payload.logFilePath, { flags: 'a' });
    let exitCode = 0;
    await (0, testRunState_1.updateRunLifecycle)(payload.appRoot, payload.runId, 'running', { startedAt: new Date().toISOString() });
    stream.write(`[run] ${payload.label}\n`);
    stream.write(`[id] ${payload.runId}\n`);
    stream.write(`[startedAt] ${new Date().toISOString()}\n`);
    for (const command of payload.commands) {
        const commandResult = await executeCommand(payload, command, stream);
        if (commandResult.exitCode !== 0) {
            exitCode = commandResult.exitCode;
        }
    }
    stream.write(`\n[finishedAt] ${new Date().toISOString()}\n`);
    stream.write(`[result] ${exitCode === 0 ? 'success' : 'failed'}\n`);
    await (0, testRunState_1.updateRunLifecycle)(payload.appRoot, payload.runId, exitCode === 0 ? 'completed' : 'failed', { finishedAt: new Date().toISOString() });
    await new Promise(resolve => stream.end(resolve));
    await promises_1.default.rm(payloadPath, { recursive: true, force: true });
    process.exit(exitCode);
}
void run().catch(async (error) => {
    const payloadPath = process.argv[2];
    if (payloadPath && (await pathExists(payloadPath))) {
        const payloadContent = await promises_1.default.readFile(payloadPath, 'utf-8');
        const payload = JSON.parse(payloadContent);
        await promises_1.default.mkdir(node_path_1.default.dirname(payload.logFilePath), { recursive: true });
        await promises_1.default.appendFile(payload.logFilePath, `[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
        await (0, testRunState_1.updateRunLifecycle)(payload.appRoot, payload.runId, 'failed', {
            finishedAt: new Date().toISOString(),
        });
        await promises_1.default.rm(payloadPath, { recursive: true, force: true });
    }
    process.exit(1);
});
//# sourceMappingURL=backgroundTestRunner.js.map