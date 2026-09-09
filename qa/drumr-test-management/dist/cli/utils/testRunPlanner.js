"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.planBackgroundTestRun = planBackgroundTestRun;
exports.startBackgroundTestRun = startBackgroundTestRun;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const testRunState_1 = require("./testRunState");
function withOptionalProps(base, optional) {
    const definedOptionalEntries = Object.entries(optional).filter(([, value]) => value !== undefined);
    return {
        ...base,
        ...Object.fromEntries(definedOptionalEntries),
    };
}
function normalizeSpecFile(specFile) {
    return specFile.replace(/\\/g, '/').replace(/^\.\//, '');
}
function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}
function stripTypeSuffix(name) {
    return name.replace(/\s+\((unit|int|e2e)\)$/i, '').trim();
}
function normalizeDisplayNameToFullName(name) {
    return stripTypeSuffix(name).replace(/\s+-\s+/g, ' ').trim();
}
function resolveJestTestNamePattern(testCase) {
    if (testCase.fullName?.trim()) {
        return `^${escapeRegex(testCase.fullName.trim())}$`;
    }
    if (testCase.testName?.trim()) {
        return `${escapeRegex(testCase.testName.trim())}$`;
    }
    const baseName = normalizeDisplayNameToFullName(testCase.name);
    if (!baseName) {
        return undefined;
    }
    return `^${escapeRegex(baseName)}$`;
}
function isIntegrationSpec(specFile) {
    return specFile.includes('/tests/integration/') || specFile.includes('.integration.spec.');
}
function isE2eSpec(specFile) {
    return specFile.includes('/tests/e2e/') || specFile.endsWith('.e2e.spec.ts') || specFile.endsWith('.e2e.spec.tsx');
}
function toWorkspaceRelativeSpec(specFile, workspace) {
    const normalized = normalizeSpecFile(specFile);
    const prefix = `${workspace}/`;
    return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}
function buildCommand(appRoot, runId, index, testCase) {
    if (!testCase.specFile) {
        throw new Error(`Test case "${testCase.name}" is missing specFile.`);
    }
    const specFile = normalizeSpecFile(testCase.specFile);
    const testName = testCase.testName?.trim();
    const jestNamePattern = resolveJestTestNamePattern(testCase);
    const resultFilePath = node_path_1.default.join((0, testRunState_1.getTestManagerDir)(appRoot), `${runId}-case-${String(index + 1).padStart(3, '0')}.json`);
    if (specFile.startsWith('backend/')) {
        const args = [
            'jest',
            '--config',
            'config/jest.config.ts',
            '--runInBand',
            '--json',
            '--outputFile',
            resultFilePath,
            toWorkspaceRelativeSpec(specFile, 'backend'),
        ];
        if (jestNamePattern) {
            args.push('--testNamePattern', jestNamePattern);
        }
        return withOptionalProps({
            label: testCase.name,
            specFile,
            cwd: node_path_1.default.join(appRoot, 'backend'),
            executable: 'npx',
            args,
            env: {
                TS_NODE_PROJECT: 'tsconfig.test.json',
            },
            resultFilePath,
            parser: 'jest',
        }, {
            caseId: testCase.id,
            testName,
            fullName: testCase.fullName,
        });
    }
    if (specFile.startsWith('frontend/') && !isE2eSpec(specFile)) {
        const args = [
            'jest',
            '--config',
            'config/jest.config.ts',
            '--runInBand',
            '--json',
            '--outputFile',
            resultFilePath,
            toWorkspaceRelativeSpec(specFile, 'frontend'),
        ];
        if (jestNamePattern) {
            args.push('--testNamePattern', jestNamePattern);
        }
        return withOptionalProps({
            label: testCase.name,
            specFile,
            cwd: node_path_1.default.join(appRoot, 'frontend'),
            executable: 'npx',
            args,
            resultFilePath,
            parser: 'jest',
        }, {
            caseId: testCase.id,
            testName,
            fullName: testCase.fullName,
        });
    }
    if (isE2eSpec(specFile)) {
        const args = ['run', 'test:e2e', '--', specFile, '--workers=1', '--reporter=json'];
        if (testCase.fullName?.trim()) {
            args.push('--grep', `^${escapeRegex(testCase.fullName.trim())}$`);
        }
        else if (testName) {
            args.push('--grep', `${escapeRegex(testName)}$`);
        }
        return withOptionalProps({
            label: testCase.name,
            specFile,
            cwd: appRoot,
            executable: 'npm',
            args,
            env: {
                PLAYWRIGHT_JSON_OUTPUT_FILE: resultFilePath,
            },
            resultFilePath,
            parser: 'playwright',
        }, {
            caseId: testCase.id,
            testName,
            fullName: testCase.fullName,
        });
    }
    throw new Error(`Unsupported test spec location: ${specFile}`);
}
function planBackgroundTestRun(appRoot, label, cases) {
    if (cases.length === 0) {
        throw new Error('Select at least one test case to run.');
    }
    const dedupedCases = Array.from(new Map(cases.map(testCase => {
        const specFile = normalizeSpecFile(testCase.specFile ?? '');
        return [`${specFile}::${testCase.fullName ?? testCase.testName ?? ''}`, testCase];
    })).values());
    const runId = `tm-${Date.now()}-${node_crypto_1.default.randomBytes(4).toString('hex')}`;
    const logDir = node_path_1.default.join(appRoot, 'logs', 'test-manager');
    const logFilePath = node_path_1.default.join(logDir, `${runId}.log`);
    return {
        runId,
        label,
        logFilePath,
        logFileRelativePath: node_path_1.default.relative(appRoot, logFilePath),
        commands: dedupedCases.map((testCase, index) => buildCommand(appRoot, runId, index, testCase)),
    };
}
async function startBackgroundTestRun(appRoot, label, cases, spawnProcess = node_child_process_1.spawn) {
    const plan = planBackgroundTestRun(appRoot, label, cases);
    await promises_1.default.mkdir(node_path_1.default.dirname(plan.logFilePath), { recursive: true });
    const runCases = plan.commands.map(command => withOptionalProps({
        name: command.label,
        status: 'pending',
        resultFileRelativePath: node_path_1.default.relative(appRoot, command.resultFilePath),
    }, {
        caseId: command.caseId,
        specFile: command.specFile,
        testName: command.testName,
        fullName: command.fullName,
    }));
    await (0, testRunState_1.initializeRunStatus)(appRoot, {
        runId: plan.runId,
        label: plan.label,
        logFileRelativePath: plan.logFileRelativePath,
        cases: runCases,
    });
    const payloadPath = node_path_1.default.join(node_path_1.default.dirname(plan.logFilePath), `${plan.runId}.payload.json`);
    const payload = {
        appRoot,
        runId: plan.runId,
        label: plan.label,
        logFilePath: plan.logFilePath,
        logFileRelativePath: plan.logFileRelativePath,
        commands: plan.commands,
    };
    await promises_1.default.writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf-8');
    const runnerPath = node_path_1.default.join(__dirname, 'backgroundTestRunner.js');
    const child = spawnProcess(process.execPath, [runnerPath, payloadPath], {
        cwd: appRoot,
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
    return plan;
}
//# sourceMappingURL=testRunPlanner.js.map