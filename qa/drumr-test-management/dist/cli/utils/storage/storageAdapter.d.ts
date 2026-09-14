/**
 * Storage abstraction for the Test Manager persistence layer.
 *
 * Keys are logical, POSIX-style relative paths (e.g. `testsManagement/test-plans.json`,
 * `logs/test-manager/<runId>.status.json`). Implementations decide how to map a key to
 * their backing store:
 *
 * - LocalStorageAdapter maps keys to files under the application root.
 * - GcsStorageAdapter maps keys to objects in a Cloud Storage bucket.
 *
 * Values are always JSON documents or plain text (logs), never binary.
 */
export interface StorageAdapter {
    /** Human-readable identifier used for logging and diagnostics. */
    readonly kind: 'local' | 'gcs';
    /** Returns the stored text, or null when the key does not exist. */
    readText(key: string): Promise<string | null>;
    /** Writes text, creating or replacing the value at the key. */
    writeText(key: string, content: string): Promise<void>;
    /** Appends text to the value at the key, creating it when missing. */
    appendText(key: string, content: string): Promise<void>;
    /** Removes the value at the key. Missing keys are ignored. */
    deleteKey(key: string): Promise<void>;
    /** Returns true when a value exists at the key. */
    exists(key: string): Promise<boolean>;
    /** Lists keys matching the given prefix. */
    list(prefix: string): Promise<string[]>;
    /**
     * Flushes any buffered writes and releases resources.
     * Safe to call multiple times.
     */
    close(): Promise<void>;
}
