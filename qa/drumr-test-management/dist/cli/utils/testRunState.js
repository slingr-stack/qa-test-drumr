"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LATEST_RUN_POINTER_KEY = exports.TEST_PLANS_KEY = exports.TEST_MANAGER_DIR_KEY = void 0;
exports.getRunStatusKey = getRunStatusKey;
exports.getRunLogKey = getRunLogKey;
exports.getRunPayloadKey = getRunPayloadKey;
exports.getRunCaseResultKey = getRunCaseResultKey;
exports.writeRunStatus = writeRunStatus;
exports.readRunStatus = readRunStatus;
exports.readLatestRunStatus = readLatestRunStatus;
exports.clearLatestRunStatus = clearLatestRunStatus;
exports.initializeRunStatus = initializeRunStatus;
exports.updateRunLifecycle = updateRunLifecycle;
exports.updateRunCase = updateRunCase;
exports.applyStatusesToTestPlans = applyStatusesToTestPlans;
/** Storage key prefix for every Test Manager artefact of a run. */
exports.TEST_MANAGER_DIR_KEY = 'logs/test-manager';
exports.TEST_PLANS_KEY = 'testsManagement/test-plans.json';
exports.LATEST_RUN_POINTER_KEY = `${exports.TEST_MANAGER_DIR_KEY}/latest-run.json`;
function getRunStatusKey(runId) {
    return `${exports.TEST_MANAGER_DIR_KEY}/${runId}.status.json`;
}
function getRunLogKey(runId) {
    return `${exports.TEST_MANAGER_DIR_KEY}/${runId}.log`;
}
function getRunPayloadKey(runId) {
    return `${exports.TEST_MANAGER_DIR_KEY}/${runId}.payload.json`;
}
function getRunCaseResultKey(runId, index) {
    return `${exports.TEST_MANAGER_DIR_KEY}/${runId}-case-${String(index + 1).padStart(3, '0')}.json`;
}
function withOptionalProps(base, optional) {
    const definedOptionalEntries = Object.entries(optional).filter(([, value]) => value !== undefined);
    return {
        ...base,
        ...Object.fromEntries(definedOptionalEntries),
    };
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
async function writeLatestRunPointer(storage, runId) {
    await storage.writeText(exports.LATEST_RUN_POINTER_KEY, JSON.stringify({ runId }, null, 2));
}
async function writeRunStatus(storage, status) {
    const normalizedStatus = {
        ...status,
        updatedAt: new Date().toISOString(),
        progress: buildProgress(status.cases),
    };
    await storage.writeText(getRunStatusKey(status.runId), JSON.stringify(normalizedStatus, null, 2));
    await writeLatestRunPointer(storage, status.runId);
}
async function readRunStatus(storage, runId) {
    const content = await storage.readText(getRunStatusKey(runId));
    if (content === null) {
        return null;
    }
    return JSON.parse(content);
}
async function readLatestRunStatus(storage) {
    const content = await storage.readText(exports.LATEST_RUN_POINTER_KEY);
    if (content === null) {
        return null;
    }
    const data = JSON.parse(content);
    if (!data.runId) {
        return null;
    }
    return readRunStatus(storage, data.runId);
}
async function clearLatestRunStatus(storage) {
    await storage.deleteKey(exports.LATEST_RUN_POINTER_KEY);
}
async function initializeRunStatus(storage, input) {
    const status = {
        runId: input.runId,
        label: input.label,
        lifecycle: 'queued',
        logFileRelativePath: input.logFileRelativePath,
        updatedAt: new Date().toISOString(),
        progress: buildProgress(input.cases),
        cases: input.cases,
    };
    await writeRunStatus(storage, status);
    await applyStatusesToTestPlans(storage, input.cases.map(testCase => withOptionalProps({
        status: testCase.status,
    }, {
        caseId: testCase.caseId,
        specFile: testCase.specFile,
        testName: testCase.testName,
        fullName: testCase.fullName,
    })));
    return status;
}
async function updateRunLifecycle(storage, runId, lifecycle, extra = {}) {
    const current = await readRunStatus(storage, runId);
    if (!current) {
        return null;
    }
    const next = {
        ...current,
        lifecycle,
        ...extra,
    };
    await writeRunStatus(storage, next);
    return next;
}
async function updateRunCase(storage, runId, matcher, patch) {
    const current = await readRunStatus(storage, runId);
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
    await writeRunStatus(storage, next);
    if (patch.status) {
        await applyStatusesToTestPlans(storage, nextCases.map(testCase => withOptionalProps({
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
async function applyStatusesToTestPlans(storage, updates) {
    const content = await storage.readText(exports.TEST_PLANS_KEY);
    if (content === null) {
        return;
    }
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
    await storage.writeText(exports.TEST_PLANS_KEY, JSON.stringify(testPlans, null, 2));
}
//# sourceMappingURL=testRunState.js.map