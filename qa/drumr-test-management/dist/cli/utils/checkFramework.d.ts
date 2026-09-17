export declare const APP_ROOT_ENV = "DRUMR_TEST_MANAGER_APP_ROOT";
export declare const BACKEND_TESTS_DIR_ENV = "DRUMR_TEST_MANAGER_BACKEND_TESTS_DIR";
export declare const FRONTEND_TESTS_DIR_ENV = "DRUMR_TEST_MANAGER_FRONTEND_TESTS_DIR";
export interface TestManagerPaths {
    appRoot: string;
    testManagerRoot: string;
}
export declare function resolveTestManagerPaths(qaRoot?: string): Promise<TestManagerPaths | null>;
