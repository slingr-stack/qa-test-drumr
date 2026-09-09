import type { TestExecutionStatus } from './testRunState';
interface ResultMatcher {
    fullName?: string;
    testName?: string;
}
export interface TestCaseResultSummary {
    status: TestExecutionStatus;
    title?: string;
    details?: string;
}
export declare function readJestCaseStatus(resultFilePath: string, matcher?: ResultMatcher): Promise<TestExecutionStatus | null>;
export declare function readPlaywrightCaseStatus(resultFilePath: string, matcher?: ResultMatcher): Promise<TestExecutionStatus | null>;
export declare function readJestCaseSummary(resultFilePath: string, matcher?: ResultMatcher): Promise<TestCaseResultSummary | null>;
export declare function readPlaywrightCaseSummary(resultFilePath: string, matcher?: ResultMatcher): Promise<TestCaseResultSummary | null>;
export {};
