export interface TestManagerPaths {
    appRoot: string;
    testManagerRoot: string;
}
export declare function getBackendPath(cwd?: string): string;
export declare function hasDrumrFramework(cwd?: string): Promise<boolean>;
export declare function resolveTestManagerPaths(qaRoot?: string): Promise<TestManagerPaths | null>;
export declare function getFrameworkPath(cwd?: string): Promise<string | null>;
