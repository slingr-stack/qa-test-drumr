import http from 'node:http';
import { type CollectedTest } from './testCollector.js';
export interface TestPlanCase {
    id: string;
    name: string;
    specFile?: string;
    testName?: string;
    fullName?: string;
    status?: 'pending' | 'passed' | 'failed' | 'skipped';
    steps?: unknown[];
}
export interface TestPlanCycle {
    id: string;
    name: string;
    cases: TestPlanCase[];
}
export interface TestPlan {
    id: string;
    name: string;
    cycles: TestPlanCycle[];
}
export interface TestPlanCaseFolder {
    id: string;
    name: string;
    parentId?: string;
    testRefs: string[];
}
export interface TestPlansFile {
    plans: TestPlan[];
    caseFolders: TestPlanCaseFolder[];
    collectedTests?: CollectedTest[];
}
export declare function createTestServer(appRoot: string, port: number, htmlPath: string): Promise<http.Server>;
