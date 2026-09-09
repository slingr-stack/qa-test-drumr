"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTestManagerDir = getTestManagerDir;
exports.getRunStatusFilePath = getRunStatusFilePath;
exports.getLatestRunPointerPath = getLatestRunPointerPath;
exports.getTestPlansFilePath = getTestPlansFilePath;
exports.writeRunStatus = writeRunStatus;
exports.readRunStatus = readRunStatus;
exports.readLatestRunStatus = readLatestRunStatus;
exports.clearLatestRunStatus = clearLatestRunStatus;
exports.initializeRunStatus = initializeRunStatus;
exports.updateRunLifecycle = updateRunLifecycle;
exports.updateRunCase = updateRunCase;
exports.applyStatusesToTestPlans = applyStatusesToTestPlans;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
async function pathExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
const TEST_MANAGER_LOG_DIR = ['logs', 'test-manager'];
const TEST_PLANS_PATH = ['testsManagement', 'test-plans.json'];
const LATEST_RUN_POINTER = 'latest-run.json';
function withOptionalProps(base, optional) {
    const definedOptionalEntries = Object.entries(optional).filter(([, value]) => value !== undefined);
    return {
        ...base,
        ...Object.fromEntries(definedOptionalEntries),
    };
}
function getTestManagerDir(appRoot) {
    return node_path_1.default.join(appRoot, ...TEST_MANAGER_LOG_DIR);
}
function getRunStatusFilePath(appRoot, runId) {
    return node_path_1.default.join(getTestManagerDir(appRoot), `${runId}.status.json`);
}
function getLatestRunPointerPath(appRoot) {
    return node_path_1.default.join(getTestManagerDir(appRoot), LATEST_RUN_POINTER);
}
function getTestPlansFilePath(appRoot) {
    return node_path_1.default.join(appRoot, ...TEST_PLANS_PATH);
}
function buildProgress(cases) {
    const total = cases.length;
    const passed = cases.filter(testCase => testCase.status === 'passed').length;
    const failed = cases.filter(testCase => testCase.status === 'failed').length;
    const skipped = cases.filter(testCase => testCase.status === 'skipped').length;
    const pending = cases.filter(testCase => testCase.status === 'pending').length;
    const completed = total - pending;
    return {
        total,
        completed,
        passed,
        failed,
        skipped,
        pending,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
}
async function writeLatestRunPointer(appRoot, runId) {
    const pointerPath = getLatestRunPointerPath(appRoot);
    await promises_1.default.mkdir(node_path_1.default.dirname(pointerPath), { recursive: true });
    await promises_1.default.writeFile(pointerPath, JSON.stringify({ runId }, null, 2), 'utf-8');
}
async function writeRunStatus(appRoot, status) {
    const filePath = getRunStatusFilePath(appRoot, status.runId);
    const normalizedStatus = {
        ...status,
        updatedAt: new Date().toISOString(),
        progress: buildProgress(status.cases),
    };
    await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
    await promises_1.default.writeFile(filePath, JSON.stringify(normalizedStatus, null, 2), 'utf-8');
    await writeLatestRunPointer(appRoot, status.runId);
}
async function readRunStatus(appRoot, runId) {
    const filePath = getRunStatusFilePath(appRoot, runId);
    if (!(await pathExists(filePath))) {
        return null;
    }
    const content = await promises_1.default.readFile(filePath, 'utf-8');
    return JSON.parse(content);
}
async function readLatestRunStatus(appRoot) {
    const pointerPath = getLatestRunPointerPath(appRoot);
    if (!(await pathExists(pointerPath))) {
        return null;
    }
    const content = await promises_1.default.readFile(pointerPath, 'utf-8');
    const data = JSON.parse(content);
    if (!data.runId) {
        return null;
    }
    return readRunStatus(appRoot, data.runId);
}
async function clearLatestRunStatus(appRoot) {
    const pointerPath = getLatestRunPointerPath(appRoot);
    if (await pathExists(pointerPath)) {
        await promises_1.default.rm(pointerPath, { recursive: true, force: true });
    }
}
async function initializeRunStatus(appRoot, input) {
    const status = {
        runId: input.runId,
        label: input.label,
        lifecycle: 'queued',
        logFileRelativePath: input.logFileRelativePath,
        updatedAt: new Date().toISOString(),
        progress: buildProgress(input.cases),
        cases: input.cases,
    };
    await writeRunStatus(appRoot, status);
    await applyStatusesToTestPlans(appRoot, input.cases.map(testCase => withOptionalProps({
        status: testCase.status,
    }, {
        caseId: testCase.caseId,
        specFile: testCase.specFile,
        testName: testCase.testName,
        fullName: testCase.fullName,
    })));
    return status;
}
async function updateRunLifecycle(appRoot, runId, lifecycle, extra = {}) {
    const current = await readRunStatus(appRoot, runId);
    if (!current) {
        return null;
    }
    const next = {
        ...current,
        lifecycle,
        ...extra,
    };
    await writeRunStatus(appRoot, next);
    return next;
}
async function updateRunCase(appRoot, runId, matcher, patch) {
    const current = await readRunStatus(appRoot, runId);
    if (!current) {
        return null;
    }
    const nextCases = current.cases.map(testCase => {
        const matchesById = matcher.caseId && testCase.caseId === matcher.caseId;
        const matchesByLocation = !matcher.caseId &&
            matcher.specFile &&
            (matcher.fullName || matcher.testName) &&
            testCase.specFile === matcher.specFile &&
            ((matcher.fullName && testCase.fullName === matcher.fullName) ||
                (matcher.testName && testCase.testName === matcher.testName));
        if (!matchesById && !matchesByLocation) {
            return testCase;
        }
        return {
            ...testCase,
            ...patch,
        };
    });
    const next = {
        ...current,
        cases: nextCases,
    };
    await writeRunStatus(appRoot, next);
    if (patch.status) {
        await applyStatusesToTestPlans(appRoot, nextCases.map(testCase => withOptionalProps({
            status: testCase.status,
        }, {
            caseId: testCase.caseId,
            specFile: testCase.specFile,
            testName: testCase.testName,
            fullName: testCase.fullName,
        })));
    }
    return next;
}
async function applyStatusesToTestPlans(appRoot, updates) {
    const testPlansPath = getTestPlansFilePath(appRoot);
    if (!(await pathExists(testPlansPath))) {
        return;
    }
    const content = await promises_1.default.readFile(testPlansPath, 'utf-8');
    const testPlans = JSON.parse(content);
    const plans = testPlans.plans ?? [];
    for (const plan of plans) {
        for (const cycle of plan.cycles ?? []) {
            for (const testCase of cycle.cases ?? []) {
                const update = updates.find(item => (item.caseId && item.caseId === testCase.id) ||
                    (!item.caseId &&
                        item.specFile === testCase.specFile &&
                        ((item.fullName && item.fullName === testCase.fullName) ||
                            (item.testName && item.testName === testCase.testName))));
                if (update) {
                    testCase.status = update.status;
                }
            }
        }
    }
    await promises_1.default.writeFile(testPlansPath, JSON.stringify(testPlans, null, 2), 'utf-8');
}
//# sourceMappingURL=testRunState.js.map