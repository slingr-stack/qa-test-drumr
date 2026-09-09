"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestServer = createTestServer;
const node_http_1 = __importDefault(require("node:http"));
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const testCollector_js_1 = require("./testCollector.js");
const testRunState_1 = require("./testRunState");
const testRunPlanner_1 = require("./testRunPlanner");
const testResultParser_1 = require("./testResultParser");
async function pathExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
const TEST_PLANS_PATH = ['testsManagement', 'test-plans.json'];
const APP_LOGO_CANDIDATES = [
    ['frontend', 'public', 'logo.svg'],
    ['frontend', 'public', 'logo.png'],
    ['frontend', 'public', 'logo.jpg'],
    ['frontend', 'public', 'logo.jpeg'],
    ['frontend', 'public', 'favicon.svg'],
    ['frontend', 'public', 'favicon.png'],
];
async function loadTestPlans(appRoot) {
    const testPlansPath = node_path_1.default.join(appRoot, ...TEST_PLANS_PATH);
    if (!(await pathExists(testPlansPath))) {
        return { ok: true, data: { plans: [], caseFolders: [], collectedTests: [] } };
    }
    try {
        const content = await promises_1.default.readFile(testPlansPath, 'utf-8');
        const data = JSON.parse(content);
        return {
            ok: true,
            data: {
                plans: data.plans ?? [],
                caseFolders: data.caseFolders ?? [],
                collectedTests: data.collectedTests ?? [],
            },
        };
    }
    catch (error) {
        return {
            ok: false,
            error: {
                code: 'INVALID_TEST_PLANS',
                message: 'testsManagement/test-plans.json is invalid. Fix or back up the file before using Test Manager.',
                filePath: testPlansPath,
                details: error instanceof Error ? error.message : String(error),
            },
        };
    }
}
async function saveTestPlans(appRoot, data) {
    const testPlansPath = node_path_1.default.join(appRoot, ...TEST_PLANS_PATH);
    await promises_1.default.mkdir(node_path_1.default.dirname(testPlansPath), { recursive: true });
    await promises_1.default.writeFile(testPlansPath, JSON.stringify(data, null, 2), 'utf-8');
}
function json(res, statusCode, body) {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(payload);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}
async function findAppLogo(appRoot) {
    for (const candidate of APP_LOGO_CANDIDATES) {
        const filePath = node_path_1.default.join(appRoot, ...candidate);
        if (await pathExists(filePath)) {
            return {
                filePath,
                publicUrl: `/app-logo${node_path_1.default.extname(filePath).toLowerCase()}`,
            };
        }
    }
    return null;
}
function getContentType(filePath) {
    switch (node_path_1.default.extname(filePath).toLowerCase()) {
        case '.svg': return 'image/svg+xml';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        default: return 'application/octet-stream';
    }
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isE2eSpec(specFile) {
    return Boolean(specFile && (specFile.includes('/tests/e2e/') || specFile.endsWith('.e2e.spec.ts') || specFile.endsWith('.e2e.spec.tsx')));
}
function formatRunLogLine(prefix, message, details) {
    return details ? `${prefix} ${message}\n${details}` : `${prefix} ${message}`;
}
async function readRunLogTail(appRoot, runId, maxLines = 160) {
    const run = await (0, testRunState_1.readRunStatus)(appRoot, runId);
    if (!run) {
        return null;
    }
    const logPath = node_path_1.default.join(appRoot, run.logFileRelativePath);
    if (!(await pathExists(logPath))) {
        return '';
    }
    const content = await promises_1.default.readFile(logPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    return lines.slice(-maxLines).join('\n');
}
async function buildRunLogSummary(appRoot, runId) {
    const run = await (0, testRunState_1.readRunStatus)(appRoot, runId);
    if (!run) {
        return null;
    }
    const lines = [];
    for (const testCase of run.cases) {
        if (testCase.status === 'passed') {
            lines.push(formatRunLogLine('PASS', testCase.name));
            continue;
        }
        if (testCase.status === 'skipped') {
            lines.push(formatRunLogLine('SKIP', testCase.name));
            continue;
        }
        if (testCase.status === 'pending') {
            if (testCase.startedAt && !testCase.finishedAt) {
                lines.push(formatRunLogLine('RUNNING', testCase.name));
            }
            else if (run.lifecycle === 'queued') {
                lines.push(formatRunLogLine('QUEUED', testCase.name));
            }
            continue;
        }
        let details = testCase.error;
        if (testCase.resultFileRelativePath) {
            const resultFilePath = node_path_1.default.join(appRoot, testCase.resultFileRelativePath);
            const matcher = Object.fromEntries(Object.entries({
                fullName: testCase.fullName,
                testName: testCase.testName,
            }).filter(([, value]) => value !== undefined));
            const summary = isE2eSpec(testCase.specFile)
                ? await (0, testResultParser_1.readPlaywrightCaseSummary)(resultFilePath, matcher)
                : await (0, testResultParser_1.readJestCaseSummary)(resultFilePath, matcher);
            if (summary?.details) {
                details = summary.details;
            }
        }
        lines.push(formatRunLogLine('FAIL', testCase.name, details));
    }
    return lines.join('\n\n').trim();
}
async function buildRunResponse(appRoot, runId) {
    const run = await (0, testRunState_1.readRunStatus)(appRoot, runId);
    if (!run) {
        return null;
    }
    return {
        run,
        logTail: (await buildRunLogSummary(appRoot, runId)) ?? '',
    };
}
async function createTestServer(appRoot, port, htmlPath) {
    let appName = node_path_1.default.basename(appRoot);
    try {
        const pkgContent = await promises_1.default.readFile(node_path_1.default.join(appRoot, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.name) {
            appName = pkg.name;
        }
    }
    catch { /* ignore */ }
    const appLogo = await findAppLogo(appRoot);
    const server = node_http_1.default.createServer(async (req, res) => {
        const url = req.url ?? '/';
        const method = req.method ?? 'GET';
        try {
            if (method === 'OPTIONS') {
                res.writeHead(204, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                });
                res.end();
                return;
            }
            if (url === '/api/state' && method === 'GET') {
                const plansData = await loadTestPlans(appRoot);
                if (!plansData.ok) {
                    json(res, 409, plansData.error);
                    return;
                }
                const activeRun = await (0, testRunState_1.readLatestRunStatus)(appRoot);
                const activeRunLogTail = activeRun ? ((await buildRunLogSummary(appRoot, activeRun.runId)) ?? '') : '';
                json(res, 200, {
                    appName,
                    appRoot,
                    appLogoUrl: appLogo?.publicUrl ?? null,
                    activeRun,
                    activeRunLogTail,
                    ...plansData.data,
                });
                return;
            }
            if (appLogo && url === appLogo.publicUrl && method === 'GET') {
                try {
                    const content = await promises_1.default.readFile(appLogo.filePath);
                    res.writeHead(200, { 'Content-Type': getContentType(appLogo.filePath) });
                    res.end(content);
                }
                catch {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('App logo not found');
                }
                return;
            }
            if (url === '/api/collect' && method === 'POST') {
                try {
                    const collectedTests = await (0, testCollector_js_1.collectTestsFromApp)(appRoot);
                    json(res, 200, { collectedTests });
                }
                catch (err) {
                    json(res, 500, { error: getErrorMessage(err) });
                }
                return;
            }
            if (url === '/api/test-plans' && method === 'PUT') {
                const currentPlans = await loadTestPlans(appRoot);
                if (!currentPlans.ok) {
                    json(res, 409, currentPlans.error);
                    return;
                }
                let data;
                try {
                    const body = await readBody(req);
                    data = JSON.parse(body);
                }
                catch (err) {
                    json(res, 400, { error: getErrorMessage(err) });
                    return;
                }
                try {
                    await saveTestPlans(appRoot, data);
                    json(res, 200, { ok: true });
                }
                catch (err) {
                    json(res, 500, { error: getErrorMessage(err) });
                }
                return;
            }
            if (url === '/api/test-runs' && method === 'POST') {
                let data;
                try {
                    const body = await readBody(req);
                    data = JSON.parse(body);
                }
                catch (err) {
                    json(res, 400, { error: getErrorMessage(err) });
                    return;
                }
                const cases = data.cases?.filter(testCase => Boolean(testCase?.specFile)) ?? [];
                if (cases.length === 0) {
                    json(res, 400, { error: 'Select at least one mapped test case before running tests.' });
                    return;
                }
                try {
                    const runPlan = await (0, testRunPlanner_1.startBackgroundTestRun)(appRoot, data.label?.trim() || `Test Manager run (${cases.length} test${cases.length === 1 ? '' : 's'})`, cases);
                    const response = await buildRunResponse(appRoot, runPlan.runId);
                    json(res, 202, {
                        ok: true,
                        runId: runPlan.runId,
                        logFile: runPlan.logFileRelativePath,
                        commandCount: runPlan.commands.length,
                        ...response,
                    });
                }
                catch (err) {
                    json(res, 400, { error: getErrorMessage(err) });
                }
                return;
            }
            if (url === '/api/test-runs/latest' && method === 'GET') {
                const run = await (0, testRunState_1.readLatestRunStatus)(appRoot);
                const logTail = run ? ((await buildRunLogSummary(appRoot, run.runId)) ?? '') : '';
                json(res, 200, { run, logTail });
                return;
            }
            if (url === '/api/test-runs/latest' && method === 'DELETE') {
                await (0, testRunState_1.clearLatestRunStatus)(appRoot);
                json(res, 200, { ok: true });
                return;
            }
            if (url.startsWith('/api/test-runs/') && method === 'GET') {
                const suffix = url.slice('/api/test-runs/'.length);
                const logMatch = suffix.match(/^([^/]+)\/log$/);
                if (logMatch) {
                    const runId = decodeURIComponent(logMatch[1]);
                    const log = await buildRunLogSummary(appRoot, runId);
                    if (log === null) {
                        json(res, 404, { error: 'Run not found.' });
                        return;
                    }
                    json(res, 200, { log });
                    return;
                }
                const runId = decodeURIComponent(suffix);
                if (!runId) {
                    json(res, 400, { error: 'Missing run id.' });
                    return;
                }
                const response = await buildRunResponse(appRoot, runId);
                if (!response) {
                    json(res, 404, { error: 'Run not found.' });
                    return;
                }
                json(res, 200, response);
                return;
            }
            if (method === 'GET') {
                try {
                    const html = await promises_1.default.readFile(htmlPath, 'utf-8');
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(html);
                }
                catch {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('UI not found. Please reinstall the CLI.');
                }
                return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
        }
        catch (err) {
            if (res.headersSent) {
                return;
            }
            if (url.startsWith('/api/')) {
                json(res, 500, { error: getErrorMessage(err) });
                return;
            }
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    });
    return new Promise((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
        server.once('error', reject);
    });
}
//# sourceMappingURL=testServer.js.map