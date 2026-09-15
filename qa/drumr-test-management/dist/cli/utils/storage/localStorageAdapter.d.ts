import type { StorageAdapter } from './storageAdapter.js';
/**
 * Stores Test Manager state as files under the Test Manager root.
 *
 * This is the default adapter and preserves the historical on-disk layout
 * (`testsManagement/test-plans.json`, `logs/test-manager/...`), so existing
 * projects keep working without any migration.
 */
export declare class LocalStorageAdapter implements StorageAdapter {
    private readonly rootDir;
    readonly kind: "local";
    constructor(rootDir: string);
    private resolve;
    readText(key: string): Promise<string | null>;
    writeText(key: string, content: string): Promise<void>;
    appendText(key: string, content: string): Promise<void>;
    deleteKey(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    list(prefix: string): Promise<string[]>;
    close(): Promise<void>;
}
