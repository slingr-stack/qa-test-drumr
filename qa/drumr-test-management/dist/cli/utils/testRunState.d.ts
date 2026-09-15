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
/** Storage key prefix for every Test Manager artefact of a run. */
export declare const TEST_MANAGER_DIR_KEY = "logs/test-manager";
export declare const TEST_PLANS_KEY = "testsManagement/test-plans.json";
export declare const LATEST_RUN_POINTER_KEY = "logs/test-manager/latest-run.json";
export declare function getRunStatusKey(runId: string): string;
export declare function getRunLogKey(runId: string): string;
export declare function getRunPayloadKey(runId: string): string;
export declare function getRunCaseResultKey(runId: string, index: number): string;
export declare function writeRunStatus(storage: StorageAdapter, status: PersistentTestRunStatus): Promise<void>;
export declare function readRunStatus(storage: StorageAdapter, runId: string): Promise<PersistentTestRunStatus | null>;
export declare function readLatestRunStatus(storage: StorageAdapter): Promise<PersistentTestRunStatus | null>;
export declare function clearLatestRunStatus(storage: StorageAdapter): Promise<void>;
export declare function initializeRunStatus(storage: StorageAdapter, input: {
    runId: string;
    label: string;
    logFileRelativePath: string;
    cases: PersistentTestRunCase[];
}): Promise<PersistentTestRunStatus>;
export declare function updateRunLifecycle(storage: StorageAdapter, runId: string, lifecycle: TestRunLifecycleStatus, extra?: Partial<Pick<PersistentTestRunStatus, 'startedAt' | 'finishedAt'>>): Promise<PersistentTestRunStatus | null>;
export declare function updateRunCase(storage: StorageAdapter, runId: string, matcher: {
    caseId?: string;
    specFile?: string;
    testName?: string;
    fullName?: string;
}, patch: Partial<PersistentTestRunCase>): Promise<PersistentTestRunStatus | null>;
export declare function applyStatusesToTestPlans(storage: StorageAdapter, updates: Array<{
    caseId?: string;
    specFile?: string;
    testName?: string;
    fullName?: string;
    status: TestExecutionStatus;
}>): Promise<void>;
