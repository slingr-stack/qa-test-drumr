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
export declare function getTestManagerDir(appRoot: string): string;
export declare function getRunStatusFilePath(appRoot: string, runId: string): string;
export declare function getLatestRunPointerPath(appRoot: string): string;
export declare function getTestPlansFilePath(appRoot: string): string;
export declare function writeRunStatus(appRoot: string, status: PersistentTestRunStatus): Promise<void>;
export declare function readRunStatus(appRoot: string, runId: string): Promise<PersistentTestRunStatus | null>;
export declare function readLatestRunStatus(appRoot: string): Promise<PersistentTestRunStatus | null>;
export declare function clearLatestRunStatus(appRoot: string): Promise<void>;
export declare function initializeRunStatus(appRoot: string, input: {
    runId: string;
    label: string;
    logFileRelativePath: string;
    cases: PersistentTestRunCase[];
}): Promise<PersistentTestRunStatus>;
export declare function updateRunLifecycle(appRoot: string, runId: string, lifecycle: TestRunLifecycleStatus, extra?: Partial<Pick<PersistentTestRunStatus, 'startedAt' | 'finishedAt'>>): Promise<PersistentTestRunStatus | null>;
export declare function updateRunCase(appRoot: string, runId: string, matcher: {
    caseId?: string;
    specFile?: string;
    testName?: string;
    fullName?: string;
}, patch: Partial<PersistentTestRunCase>): Promise<PersistentTestRunStatus | null>;
export declare function applyStatusesToTestPlans(appRoot: string, updates: Array<{
    caseId?: string;
    specFile?: string;
    testName?: string;
    fullName?: string;
    status: TestExecutionStatus;
}>): Promise<void>;
