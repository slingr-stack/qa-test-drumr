import path from 'node:path';
import fsp from 'node:fs/promises';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export type TestExecutionStatus = 'pending' | 'passed' | 'failed' | 'skipped';
export type TestRunLifecycleStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface PersistentTestRunCase {
  caseId?: string;
  name: string;
  specFile?: string;
  testName?: string;
  fullName?: string;
  status: TestExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  resultFileRelativePath?: string;
  error?: string;
}

export interface PersistentTestRunProgress {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  percent: number;
}

export interface PersistentTestRunStatus {
  runId: string;
  label: string;
  lifecycle: TestRunLifecycleStatus;
  logFileRelativePath: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  progress: PersistentTestRunProgress;
  cases: PersistentTestRunCase[];
}

interface PersistedTestPlansFile {
  plans?: Array<{
    id: string;
    name: string;
    cycles?: Array<{
      id: string;
      name: string;
      cases?: Array<{
        id: string;
        name: string;
        specFile?: string;
        testName?: string;
        fullName?: string;
        status?: TestExecutionStatus;
      }>;
    }>;
  }>;
  caseFolders?: unknown[];
  collectedTests?: unknown[];
}

const TEST_MANAGER_LOG_DIR = ['logs', 'test-manager'] as const;
const TEST_PLANS_PATH = ['testsManagement', 'test-plans.json'] as const;
const LATEST_RUN_POINTER = 'latest-run.json';

function withOptionalProps<T extends object>(base: T, optional: Record<string, unknown>): T {
  const definedOptionalEntries = Object.entries(optional).filter(([, value]) => value !== undefined);
  return {
    ...base,
    ...Object.fromEntries(definedOptionalEntries),
  };
}

export function getTestManagerDir(appRoot: string): string {
  return path.join(appRoot, ...TEST_MANAGER_LOG_DIR);
}

export function getRunStatusFilePath(appRoot: string, runId: string): string {
  return path.join(getTestManagerDir(appRoot), `${runId}.status.json`);
}

export function getLatestRunPointerPath(appRoot: string): string {
  return path.join(getTestManagerDir(appRoot), LATEST_RUN_POINTER);
}

export function getTestPlansFilePath(appRoot: string): string {
  return path.join(appRoot, ...TEST_PLANS_PATH);
}

function buildProgress(cases: PersistentTestRunCase[]): PersistentTestRunProgress {
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

async function writeLatestRunPointer(appRoot: string, runId: string): Promise<void> {
  const pointerPath = getLatestRunPointerPath(appRoot);
  await fsp.mkdir(path.dirname(pointerPath), { recursive: true });
  await fsp.writeFile(pointerPath, JSON.stringify({ runId }, null, 2), 'utf-8');
}

export async function writeRunStatus(appRoot: string, status: PersistentTestRunStatus): Promise<void> {
  const filePath = getRunStatusFilePath(appRoot, status.runId);
  const normalizedStatus: PersistentTestRunStatus = {
    ...status,
    updatedAt: new Date().toISOString(),
    progress: buildProgress(status.cases),
  };
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(normalizedStatus, null, 2), 'utf-8');
  await writeLatestRunPointer(appRoot, status.runId);
}

export async function readRunStatus(appRoot: string, runId: string): Promise<PersistentTestRunStatus | null> {
  const filePath = getRunStatusFilePath(appRoot, runId);
  if (!(await pathExists(filePath))) {
    return null;
  }

  const content = await fsp.readFile(filePath, 'utf-8');
  return JSON.parse(content) as PersistentTestRunStatus;
}

export async function readLatestRunStatus(appRoot: string): Promise<PersistentTestRunStatus | null> {
  const pointerPath = getLatestRunPointerPath(appRoot);
  if (!(await pathExists(pointerPath))) {
    return null;
  }

  const content = await fsp.readFile(pointerPath, 'utf-8');
  const data = JSON.parse(content) as { runId?: string };
  if (!data.runId) {
    return null;
  }

  return readRunStatus(appRoot, data.runId);
}

export async function clearLatestRunStatus(appRoot: string): Promise<void> {
  const pointerPath = getLatestRunPointerPath(appRoot);
  if (await pathExists(pointerPath)) {
    await fsp.rm(pointerPath, { recursive: true, force: true });
  }
}

export async function initializeRunStatus(
  appRoot: string,
  input: {
    runId: string;
    label: string;
    logFileRelativePath: string;
    cases: PersistentTestRunCase[];
  },
): Promise<PersistentTestRunStatus> {
  const status: PersistentTestRunStatus = {
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

export async function updateRunLifecycle(
  appRoot: string,
  runId: string,
  lifecycle: TestRunLifecycleStatus,
  extra: Partial<Pick<PersistentTestRunStatus, 'startedAt' | 'finishedAt'>> = {},
): Promise<PersistentTestRunStatus | null> {
  const current = await readRunStatus(appRoot, runId);
  if (!current) {
    return null;
  }

  const next: PersistentTestRunStatus = {
    ...current,
    lifecycle,
    ...extra,
  };
  await writeRunStatus(appRoot, next);
  return next;
}

export async function updateRunCase(
  appRoot: string,
  runId: string,
  matcher: { caseId?: string; specFile?: string; testName?: string; fullName?: string },
  patch: Partial<PersistentTestRunCase>,
): Promise<PersistentTestRunStatus | null> {
  const current = await readRunStatus(appRoot, runId);
  if (!current) {
    return null;
  }

  const nextCases = current.cases.map(testCase => {
    const matchesById = matcher.caseId && testCase.caseId === matcher.caseId;
    const matchesByLocation =
      !matcher.caseId &&
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

  const next: PersistentTestRunStatus = {
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

export async function applyStatusesToTestPlans(
  appRoot: string,
  updates: Array<{
    caseId?: string;
    specFile?: string;
    testName?: string;
    fullName?: string;
    status: TestExecutionStatus;
  }>,
): Promise<void> {
  const testPlansPath = getTestPlansFilePath(appRoot);
  if (!(await pathExists(testPlansPath))) {
    return;
  }

  const content = await fsp.readFile(testPlansPath, 'utf-8');
  const testPlans = JSON.parse(content) as PersistedTestPlansFile;
  const plans = testPlans.plans ?? [];

  for (const plan of plans) {
    for (const cycle of plan.cycles ?? []) {
      for (const testCase of cycle.cases ?? []) {
        const update = updates.find(item =>
          (item.caseId && item.caseId === testCase.id) ||
          (!item.caseId &&
            item.specFile === testCase.specFile &&
            ((item.fullName && item.fullName === testCase.fullName) ||
              (item.testName && item.testName === testCase.testName))),
        );
        if (update) {
          testCase.status = update.status;
        }
      }
    }
  }

  await fsp.writeFile(testPlansPath, JSON.stringify(testPlans, null, 2), 'utf-8');
}
