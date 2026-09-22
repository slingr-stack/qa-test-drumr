export declare const APP_ROOT_ENV = "DRUMR_TEST_MANAGER_APP_ROOT";
export declare const BACKEND_TESTS_DIR_ENV = "DRUMR_TEST_MANAGER_BACKEND_TESTS_DIR";
export declare const FRONTEND_TESTS_DIR_ENV = "DRUMR_TEST_MANAGER_FRONTEND_TESTS_DIR";
export declare const TEST_MANAGER_CONFIG_FILENAME = "config.json";
export interface TestManagerConfig {
    appRoot?: string;
    backendTestsDir?: string;
    frontendTestsDir?: string;
    environment?: {
        E2E_BASE_URL?: string;
        E2E_API_BASE_URL?: string;
    };
}
export interface TestManagerPaths {
    appRoot: string;
    testManagerRoot: string;
    config: TestManagerConfig;
}
export declare function loadTestManagerConfig(testManagerRoot: string): Promise<TestManagerConfig>;
export declare function resolveTestManagerPaths(qaRoot?: string): Promise<TestManagerPaths | null>;
