"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readJestCaseStatus = readJestCaseStatus;
exports.readPlaywrightCaseStatus = readPlaywrightCaseStatus;
exports.readJestCaseSummary = readJestCaseSummary;
exports.readPlaywrightCaseSummary = readPlaywrightCaseSummary;
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
function withOptionalProps(base, optional) {
    return {
        ...base,
        ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
    };
}
function mapJestStatus(status) {
    switch (status) {
        case 'passed':
            return 'passed';
        case 'pending':
            return 'pending';
        case 'skipped':
        case 'todo':
            return 'skipped';
        default:
            return 'failed';
    }
}
function mapPlaywrightStatus(status) {
    switch (status) {
        case 'passed':
            return 'passed';
        case 'skipped':
            return 'skipped';
        case 'interrupted':
        case 'timedOut':
        case 'failed':
            return 'failed';
        default:
            return 'pending';
    }
}
function collectPlaywrightTests(node, tests) {
    if (!node || typeof node !== 'object') {
        return;
    }
    if (Array.isArray(node.tests)) {
        tests.push(...(node.tests ?? []));
    }
    for (const key of ['suites', 'specs']) {
        const children = node[key];
        if (Array.isArray(children)) {
            for (const child of children) {
                collectPlaywrightTests(child, tests);
            }
        }
    }
}
function stripAnsi(value) {
    return value.replace(/\u001b\[[0-9;]*m/g, '');
}
function trimRelevantLines(value, maxLines = 12) {
    const lines = stripAnsi(value)
        .split(/\r?\n/)
        .map(line => line.replace(/\s+$/g, ''))
        .filter((line, index, all) => line.trim() || (index > 0 && index < all.length - 1));
    return lines.slice(0, maxLines).join('\n').trim();
}
function pickMatcherTitle(matcher) {
    return matcher.fullName || matcher.testName;
}
async function readJestCaseResultSummary(resultFilePath, matcher = {}) {
    if (!(await pathExists(resultFilePath))) {
        return null;
    }
    const content = await promises_1.default.readFile(resultFilePath, 'utf-8');
    const data = JSON.parse(content);
    const totalTests = Number(data.numTotalTests ?? 0);
    const pendingTests = Number(data.numPendingTests ?? 0) + Number(data.numTodoTests ?? 0);
    const assertions = data.testResults?.flatMap(item => item.assertionResults ?? []) ?? [];
    const matchedAssertion = assertions.find(assertion => (matcher.fullName && assertion.fullName === matcher.fullName) ||
        (matcher.testName && assertion.title === matcher.testName));
    if (matchedAssertion) {
        return withOptionalProps({
            status: mapJestStatus(matchedAssertion.status),
        }, {
            title: matchedAssertion.fullName || matchedAssertion.title || pickMatcherTitle(matcher),
            details: matchedAssertion.status === 'failed'
                ? trimRelevantLines((matchedAssertion.failureMessages ?? []).join('\n\n')) || undefined
                : undefined,
        });
    }
    if (assertions.length > 0 && assertions.every(item => item.status === 'pending' || item.status === 'todo' || item.status === 'skipped')) {
        return withOptionalProps({
            status: 'skipped',
        }, {
            title: pickMatcherTitle(matcher),
        });
    }
    const firstAssertion = assertions[0];
    if (firstAssertion) {
        return withOptionalProps({
            status: mapJestStatus(firstAssertion.status),
        }, {
            title: firstAssertion.fullName || firstAssertion.title || pickMatcherTitle(matcher),
            details: firstAssertion.status === 'failed'
                ? trimRelevantLines((firstAssertion.failureMessages ?? []).join('\n\n')) || undefined
                : undefined,
        });
    }
    const suite = data.testResults?.find(item => item.status || item.message);
    const suiteStatus = suite?.status;
    if (suiteStatus === 'skipped' || suiteStatus === 'pending' || (totalTests > 0 && pendingTests >= totalTests)) {
        return withOptionalProps({
            status: 'skipped',
        }, {
            title: pickMatcherTitle(matcher),
        });
    }
    if (suiteStatus === 'failed') {
        return withOptionalProps({
            status: 'failed',
        }, {
            title: pickMatcherTitle(matcher),
            details: trimRelevantLines(suite?.message ?? '') || undefined,
        });
    }
    return null;
}
async function readPlaywrightCaseResultSummary(resultFilePath, matcher = {}) {
    if (!(await pathExists(resultFilePath))) {
        return null;
    }
    const content = await promises_1.default.readFile(resultFilePath, 'utf-8');
    const data = JSON.parse(content);
    const tests = [];
    collectPlaywrightTests(data, tests);
    const matchedTest = tests.find(test => (matcher.fullName && test.title === matcher.fullName) ||
        (matcher.testName && test.title === matcher.testName)) ?? tests[0];
    if (!matchedTest) {
        const topLevelDetails = trimRelevantLines((data.errors ?? [])
            .flatMap(error => [error.message, error.stack, error.snippet])
            .filter(Boolean)
            .join('\n\n')) || undefined;
        return topLevelDetails
            ? withOptionalProps({
                status: 'failed',
            }, {
                title: pickMatcherTitle(matcher),
                details: topLevelDetails,
            })
            : null;
    }
    const latestResult = matchedTest.results?.at(-1);
    const details = latestResult
        ? trimRelevantLines([
            latestResult.error?.message,
            latestResult.error?.value,
            ...(latestResult.errors ?? []).flatMap(error => [error.message, error.value]),
        ].filter(Boolean).join('\n\n')) || undefined
        : undefined;
    const topLevelDetails = trimRelevantLines((data.errors ?? [])
        .flatMap(error => [error.message, error.stack, error.snippet])
        .filter(Boolean)
        .join('\n\n')) || undefined;
    return withOptionalProps({
        status: mapPlaywrightStatus(latestResult?.status ?? matchedTest.status),
    }, {
        title: matchedTest.title || pickMatcherTitle(matcher),
        details: details || topLevelDetails,
    });
}
async function readJestCaseStatus(resultFilePath, matcher = {}) {
    const summary = await readJestCaseResultSummary(resultFilePath, matcher);
    return summary?.status ?? null;
}
async function readPlaywrightCaseStatus(resultFilePath, matcher = {}) {
    const summary = await readPlaywrightCaseResultSummary(resultFilePath, matcher);
    return summary?.status ?? null;
}
async function readJestCaseSummary(resultFilePath, matcher = {}) {
    return readJestCaseResultSummary(resultFilePath, matcher);
}
async function readPlaywrightCaseSummary(resultFilePath, matcher = {}) {
    return readPlaywrightCaseResultSummary(resultFilePath, matcher);
}
//# sourceMappingURL=testResultParser.js.map