import type { StorageAdapter } from './storageAdapter.js';
export interface GcsStorageAdapterOptions {
    bucketName: string;
    /** Object-name prefix, e.g. `my-app`. Keeps several apps in one bucket. */
    prefix?: string;
    /** Flush interval for buffered appends, in milliseconds. */
    flushIntervalMs?: number;
}
/**
 * Stores Test Manager state as objects in a Google Cloud Storage bucket.
 *
 * Appends are buffered in memory and flushed periodically: Cloud Storage
 * objects are immutable, so every flush is a read-modify-write of the whole
 * object. Buffering keeps log streaming from turning into one upload per line.
 *
 * Authentication uses Application Default Credentials, so a developer machine
 * only needs `gcloud auth application-default login` (or a service account via
 * `GOOGLE_APPLICATION_CREDENTIALS`).
 */
export declare class GcsStorageAdapter implements StorageAdapter {
    private readonly bucket;
    private readonly bucketName;
    private readonly prefix;
    private readonly flushIntervalMs;
    readonly kind: "gcs";
    private readonly pending;
    private flushTimer;
    private lastFlushError;
    private closed;
    private constructor();
    static create(options: GcsStorageAdapterOptions): Promise<GcsStorageAdapter>;
    private objectName;
    readText(key: string): Promise<string | null>;
    writeText(key: string, content: string): Promise<void>;
    appendText(key: string, content: string): Promise<void>;
    deleteKey(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    list(prefix: string): Promise<string[]>;
    close(): Promise<void>;
    private scheduleFlush;
    private flush;
}
