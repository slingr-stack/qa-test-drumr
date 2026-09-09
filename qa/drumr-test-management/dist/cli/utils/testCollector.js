"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifySpecFile = classifySpecFile;
exports.collectTestsFromApp = collectTestsFromApp;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const TEST_FILE_RE = /(?:\.integration)?\.(?:spec|test)\.tsx?$/;
const INTEGRATION_TEST_FILE_RE = /\.integration\.(?:spec|test)\.tsx?$/;
function classifySpecFile(relPath) {
    if (INTEGRATION_TEST_FILE_RE.test(relPath)) {
        return 'int';
    }
    if (/[\\/]e2e[\\/]/.test(relPath)) {
        return 'e2e';
    }
    return 'unit';
}
function parseSpecFile(source) {
    const text = source
        .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
        .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
    const entries = [];
    const descRe = /(?<![.\w'"`])(?:describe|test\.describe(?:\.[a-z]+)?)\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    let m;
    while ((m = descRe.exec(text)) !== null) {
        entries.push({ pos: m.index, kind: 'describe', name: (m[1] ?? m[2] ?? '').replace(/\\(.)/g, '$1') });
    }
    const itRe = /(?<![.\w'"`])it\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    while ((m = itRe.exec(text)) !== null) {
        entries.push({ pos: m.index, kind: 'test', name: (m[1] ?? m[2] ?? '').replace(/\\(.)/g, '$1') });
    }
    const testCallRe = /(?<![.\w'"`])test\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    while ((m = testCallRe.exec(text)) !== null) {
        entries.push({ pos: m.index, kind: 'test', name: (m[1] ?? m[2] ?? '').replace(/\\(.)/g, '$1') });
    }
    entries.sort((a, b) => a.pos - b.pos);
    const braces = [];
    {
        let inStr = false;
        let strCh = '';
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inStr) {
                if (c === '\\') {
                    i++;
                }
                else if (c === strCh) {
                    inStr = false;
                }
            }
            else {
                if (c === "'" || c === '"') {
                    inStr = true;
                    strCh = c;
                }
                else if (c === '{') {
                    braces.push({ pos: i, delta: 1 });
                }
                else if (c === '}') {
                    braces.push({ pos: i, delta: -1 });
                }
            }
        }
    }
    const scopes = [];
    for (const entry of entries.filter(e => e.kind === 'describe')) {
        const first = braces.find(b => b.pos > entry.pos && b.delta === 1);
        if (!first) {
            continue;
        }
        let depth = 1;
        let close = -1;
        for (const b of braces) {
            if (b.pos <= first.pos) {
                continue;
            }
            depth += b.delta;
            if (depth === 0) {
                close = b.pos;
                break;
            }
        }
        if (close !== -1) {
            scopes.push({ name: entry.name, openBrace: first.pos, closeBrace: close });
        }
    }
    const results = [];
    for (const entry of entries.filter(e => e.kind === 'test')) {
        const containing = scopes.filter(s => s.openBrace < entry.pos && s.closeBrace > entry.pos);
        const sortedContaining = [...containing].sort((left, right) => left.openBrace - right.openBrace);
        const innermost = containing.length > 0
            ? containing.reduce((p, c) => c.closeBrace - c.openBrace < p.closeBrace - p.openBrace ? c : p)
            : null;
        const fullName = [...sortedContaining.map(scope => scope.name), entry.name].filter(Boolean).join(' ');
        results.push({ describeName: innermost?.name ?? '', testName: entry.name, fullName });
    }
    return results;
}
async function findSpecFiles(dir, rel = '') {
    const ignored = ['node_modules', 'dist', '.umi', 'coverage', '.cache'];
    const results = [];
    let entries;
    try {
        entries = await promises_1.default.readdir(node_path_1.default.join(dir, rel), { withFileTypes: true });
    }
    catch {
        return results;
    }
    for (const entry of entries) {
        if (ignored.includes(entry.name)) {
            continue;
        }
        const relEntry = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            results.push(...(await findSpecFiles(dir, relEntry)));
        }
        else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
            results.push(relEntry);
        }
    }
    return results;
}
async function collectTestsFromApp(appRoot) {
    const specFiles = await findSpecFiles(appRoot);
    const results = [];
    for (const relPath of specFiles) {
        const normalized = relPath.replace(/\\/g, '/');
        const type = classifySpecFile(normalized);
        let content;
        try {
            content = await promises_1.default.readFile(node_path_1.default.join(appRoot, relPath), 'utf-8');
        }
        catch {
            continue;
        }
        for (const { describeName, testName, fullName } of parseSpecFile(content)) {
            const suffix = type === 'unit' ? 'unit' : type === 'int' ? 'int' : 'e2e';
            const displayName = describeName
                ? `${describeName} - ${testName} (${suffix})`
                : `${testName} (${suffix})`;
            results.push({ describeName, testName, fullName, specFile: normalized, type, displayName });
        }
    }
    return results;
}
//# sourceMappingURL=testCollector.js.map