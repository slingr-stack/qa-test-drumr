import type { StorageAdapter } from './storage/index.js';

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

/** Storage key prefix for every Test Manager artefact of a run. */
export const TEST_MANAGER_DIR_KEY = 'logs/test-manager';
export const TEST_PLANS_KEY = 'testsManagement/test-plans.json';
export const LATEST_RUN_POINTER_KEY = `${TEST_MANAGER_DIR_KEY}/latest-run.json`;

export function getRunStatusKey(runId: string): string {
  return `${TEST_MANAGER_DIR_KEY}/${runId}.status.json`;
}

export function getRunLogKey(runId: string): string {
  return `${TEST_MANAGER_DIR_KEY}/${runId}.log`;
}

export function getRunPayloadKey(runId: string): string {
  return `${TEST_MANAGER_DIR_KEY}/${runId}.payload.json`;
}

export function getRunCaseResultKey(runId: string, index: number): string {
  return `${TEST_MANAGER_DIR_KEY}/${runId}-case-${String(index + 1).padStart(3, '0')}.json`;
}

function withOptionalProps<T extends object>(base: T, optional: Record<string, unknown>): T {
  const definedOptionalEntries = Object.entries(optional).filter(([, value]) => value !== undefined);
  return {
    ...base,
    ...Object.fromEntries(definedOptionalEntries),
  };
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

async function writeLatestRunPointer(storage: StorageAdapter, runId: string): Promise<void> {
  await storage.writeText(LATEST_RUN_POINTER_KEY, JSON.stringify({ runId }, null, 2));
}

export async function writeRunStatus(
  storage: StorageAdapter,
  status: PersistentTestRunStatus,
): Promise<void> {
  const normalizedStatus: PersistentTestRunStatus = {
    ...status,
    updatedAt: new Date().toISOString(),
    progress: buildProgress(status.cases),
  };

  await storage.writeText(getRunStatusKey(status.runId), JSON.stringify(normalizedStatus, null, 2));
  await writeLatestRunPointer(storage, status.runId);
}

export async function readRunStatus(
  storage: StorageAdapter,
  runId: string,
): Promise<PersistentTestRunStatus | null> {
  const content = await storage.readText(getRunStatusKey(runId));
  if (content === null) {
    return null;
  }

  return JSON.parse(content) as PersistentTestRunStatus;
}

export async function readLatestRunStatus(
  storage: StorageAdapter,
): Promise<PersistentTestRunStatus | null> {
  const content = await storage.readText(LATEST_RUN_POINTER_KEY);
  if (content === null) {
    return null;
  }

  const data = JSON.parse(content) as { runId?: string };
  if (!data.runId) {
    return null;
  }

  return readRunStatus(storage, data.runId);
}

export async function clearLatestRunStatus(storage: StorageAdapter): Promise<void> {
  await storage.deleteKey(LATEST_RUN_POINTER_KEY);
}

export async function initializeRunStatus(
  storage: StorageAdapter,
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

export async function updateRunLifecycle(
  storage: StorageAdapter,
  runId: string,
  lifecycle: TestRunLifecycleStatus,
  extra: Partial<Pick<PersistentTestRunStatus, 'startedAt' | 'finishedAt'>> = {},
): Promise<PersistentTestRunStatus | null> {
  const current = await readRunStatus(storage, runId);
  if (!current) {
    return null;
  }

  const next: PersistentTestRunStatus = {
    ...current,
    lifecycle,
    ...extra,
  };

  await writeRunStatus(storage, next);
  return next;
}

export async function updateRunCase(
  storage: StorageAdapter,
  runId: string,
  matcher: { caseId?: string; specFile?: string; testName?: string; fullName?: string },
  patch: Partial<PersistentTestRunCase>,
): Promise<PersistentTestRunStatus | null> {
  const current = await readRunStatus(storage, runId);
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

export async function applyStatusesToTestPlans(
  storage: StorageAdapter,
  updates: Array<{
    caseId?: string;
    specFile?: string;
    testName?: string;
    fullName?: string;
    status: TestExecutionStatus;
  }>,
): Promise<void> {
  const content = await storage.readText(TEST_PLANS_KEY);
  if (content === null) {
    return;
  }

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

  await storage.writeText(TEST_PLANS_KEY, JSON.stringify(testPlans, null, 2));
}
