import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import fsp from 'node:fs/promises';
import {
  type PersistentTestRunCase,
  getTestManagerDir,
  initializeRunStatus,
} from './testRunState';

export interface RunnableTestCase {
  id?: string;
  name: string;
  specFile?: string;
  testName?: string;
  fullName?: string;
}

export interface BackgroundTestCommand {
  label: string;
  caseId?: string;
  specFile?: string;
  testName?: string;
  fullName?: string;
  cwd: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  resultFilePath: string;
  parser: 'jest' | 'playwright';
}

export interface BackgroundTestRunPlan {
  runId: string;
  label: string;
  logFilePath: string;
  logFileRelativePath: string;
  commands: BackgroundTestCommand[];
}

interface BackgroundRunnerPayload {
  appRoot: string;
  runId: string;
  label: string;
  logFilePath: string;
  logFileRelativePath: string;
  commands: BackgroundTestCommand[];
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

function withOptionalProps<T extends object>(base: T, optional: Record<string, unknown>): T {
  const definedOptionalEntries = Object.entries(optional).filter(([, value]) => value !== undefined);
  return {
    ...base,
    ...Object.fromEntries(definedOptionalEntries),
  };
}

function normalizeSpecFile(specFile: string): string {
  return specFile.replace(/\\/g, '/').replace(/^\.\//, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function stripTypeSuffix(name: string): string {
  return name.replace(/\s+\((unit|int|e2e)\)$/i, '').trim();
}

function normalizeDisplayNameToFullName(name: string): string {
  return stripTypeSuffix(name).replace(/\s+-\s+/g, ' ').trim();
}

function resolveJestTestNamePattern(testCase: RunnableTestCase): string | undefined {
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

function isIntegrationSpec(specFile: string): boolean {
  return specFile.includes('/tests/integration/') || specFile.includes('.integration.spec.');
}

function isE2eSpec(specFile: string): boolean {
  return specFile.includes('/tests/e2e/') || specFile.endsWith('.e2e.spec.ts') || specFile.endsWith('.e2e.spec.tsx');
}

function toWorkspaceRelativeSpec(specFile: string, workspace: 'backend' | 'frontend'): string {
  const normalized = normalizeSpecFile(specFile);
  const prefix = `${workspace}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

function buildCommand(appRoot: string, runId: string, index: number, testCase: RunnableTestCase): BackgroundTestCommand {
  if (!testCase.specFile) {
    throw new Error(`Test case "${testCase.name}" is missing specFile.`);
  }

  const specFile = normalizeSpecFile(testCase.specFile);
  const testName = testCase.testName?.trim();
  const jestNamePattern = resolveJestTestNamePattern(testCase);
  const resultFilePath = path.join(getTestManagerDir(appRoot), `${runId}-case-${String(index + 1).padStart(3, '0')}.json`);

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
      cwd: path.join(appRoot, 'backend'),
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
      cwd: path.join(appRoot, 'frontend'),
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
    } else if (testName) {
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

export function planBackgroundTestRun(
  appRoot: string,
  label: string,
  cases: RunnableTestCase[],
): BackgroundTestRunPlan {
  if (cases.length === 0) {
    throw new Error('Select at least one test case to run.');
  }

  const dedupedCases = Array.from(
    new Map(
      cases.map(testCase => {
        const specFile = normalizeSpecFile(testCase.specFile ?? '');
        return [`${specFile}::${testCase.fullName ?? testCase.testName ?? ''}`, testCase] as const;
      }),
    ).values(),
  );

  const runId = `tm-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const logDir = path.join(appRoot, 'logs', 'test-manager');
  const logFilePath = path.join(logDir, `${runId}.log`);

  return {
    runId,
    label,
    logFilePath,
    logFileRelativePath: path.relative(appRoot, logFilePath),
    commands: dedupedCases.map((testCase, index) => buildCommand(appRoot, runId, index, testCase)),
  };
}

export async function startBackgroundTestRun(
  appRoot: string,
  label: string,
  cases: RunnableTestCase[],
  spawnProcess: SpawnProcess = spawn as unknown as SpawnProcess,
): Promise<BackgroundTestRunPlan> {
  const plan = planBackgroundTestRun(appRoot, label, cases);
  await fsp.mkdir(path.dirname(plan.logFilePath), { recursive: true });

  const runCases: PersistentTestRunCase[] = plan.commands.map(command => withOptionalProps({
    name: command.label,
    status: 'pending',
    resultFileRelativePath: path.relative(appRoot, command.resultFilePath),
  }, {
    caseId: command.caseId,
    specFile: command.specFile,
    testName: command.testName,
    fullName: command.fullName,
  }));

  await initializeRunStatus(appRoot, {
    runId: plan.runId,
    label: plan.label,
    logFileRelativePath: plan.logFileRelativePath,
    cases: runCases,
  });

  const payloadPath = path.join(path.dirname(plan.logFilePath), `${plan.runId}.payload.json`);
  const payload: BackgroundRunnerPayload = {
    appRoot,
    runId: plan.runId,
    label: plan.label,
    logFilePath: plan.logFilePath,
    logFileRelativePath: plan.logFileRelativePath,
    commands: plan.commands,
  };

  await fsp.writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf-8');

  const runnerPath = path.join(__dirname, 'backgroundTestRunner.js');
  const child = spawnProcess(process.execPath, [runnerPath, payloadPath], {
    cwd: appRoot,
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
  return plan;
}
