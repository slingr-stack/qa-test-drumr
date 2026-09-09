import { type ChildProcess, type SpawnOptions } from 'node:child_process';
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
type SpawnProcess = (command: string, args: string[], options: SpawnOptions) => ChildProcess;
export declare function planBackgroundTestRun(appRoot: string, label: string, cases: RunnableTestCase[]): BackgroundTestRunPlan;
export declare function startBackgroundTestRun(appRoot: string, label: string, cases: RunnableTestCase[], spawnProcess?: SpawnProcess): Promise<BackgroundTestRunPlan>;
export {};
