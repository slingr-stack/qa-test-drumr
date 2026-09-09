import fsp from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

export interface CollectedTest {
  describeName: string;
  testName: string;
  fullName: string;
  specFile: string;
  type: 'unit' | 'int' | 'e2e';
  displayName: string;
}

const TEST_FILE_RE = /(?:\.integration)?\.(?:spec|test)\.tsx?$/;
const INTEGRATION_TEST_FILE_RE = /\.integration\.(?:spec|test)\.tsx?$/;

export function classifySpecFile(relPath: string): 'unit' | 'int' | 'e2e' {
  if (INTEGRATION_TEST_FILE_RE.test(relPath)) {
return 'int';
}
  if (/[\\/]e2e[\\/]/.test(relPath)) {
return 'e2e';
}
  return 'unit';
}

function parseSpecFile(source: string): Array<{ describeName: string; testName: string; fullName: string }> {
  const text = source
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

  type Entry = { pos: number; kind: 'describe' | 'test'; name: string };
  const entries: Entry[] = [];

  const descRe =
    /(?<![.\w'"`])(?:describe|test\.describe(?:\.[a-z]+)?)\s*\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  let m: RegExpExecArray | null;
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

  const braces: Array<{ pos: number; delta: 1 | -1 }> = [];
  {
    let inStr = false;
    let strCh = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') {
i++;
} else if (c === strCh) {
inStr = false;
}
      } else {
        if (c === "'" || c === '"') {
  inStr = true; strCh = c; 
} else if (c === '{') {
braces.push({ pos: i, delta: 1 });
} else if (c === '}') {
braces.push({ pos: i, delta: -1 });
}
      }
    }
  }

  interface DescribeScope { name: string; openBrace: number; closeBrace: number }
  const scopes: DescribeScope[] = [];

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
  close = b.pos; break; 
}
    }
    if (close !== -1) {
scopes.push({ name: entry.name, openBrace: first.pos, closeBrace: close });
}
  }

  const results: Array<{ describeName: string; testName: string; fullName: string }> = [];
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

async function findSpecFiles(dir: string, rel = ''): Promise<string[]> {
  const ignored = ['node_modules', 'dist', '.umi', 'coverage', '.cache'];
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (ignored.includes(entry.name)) {
continue;
}
    const relEntry = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...(await findSpecFiles(dir, relEntry)));
    } else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
      results.push(relEntry);
    }
  }
  return results;
}

export async function collectTestsFromApp(appRoot: string): Promise<CollectedTest[]> {
  const specFiles = await findSpecFiles(appRoot);
  const results: CollectedTest[] = [];

  for (const relPath of specFiles) {
    const normalized = relPath.replace(/\\/g, '/');
    const type = classifySpecFile(normalized);
    let content: string;
    try {
      content = await fsp.readFile(path.join(appRoot, relPath), 'utf-8');
    } catch {
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
