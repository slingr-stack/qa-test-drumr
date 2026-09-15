import type { StorageAdapter } from './storageAdapter.js';
export type { StorageAdapter } from './storageAdapter.js';
export { LocalStorageAdapter } from './localStorageAdapter.js';
export { GcsStorageAdapter } from './gcsStorageAdapter.js';
/** Selects where Test Manager state is stored. Defaults to `local`. */
export declare const STORAGE_KIND_ENV = "DRUMR_TEST_MANAGER_STORAGE";
/** Cloud Storage bucket name. Required when storage kind is `gcs`. */
export declare const STORAGE_BUCKET_ENV = "DRUMR_TEST_MANAGER_GCS_BUCKET";
/** Optional object-name prefix inside the bucket. Defaults to the app directory name. */
export declare const STORAGE_PREFIX_ENV = "DRUMR_TEST_MANAGER_GCS_PREFIX";
export declare function resolveStorageKind(): 'local' | 'gcs';
/**
 * Builds the storage adapter for a Test Manager process.
 *
 * Local storage keeps every artefact on disk under the Test Manager root, so the
 * Test Manager works offline with zero configuration. Cloud Storage is opt-in
 * through `DRUMR_TEST_MANAGER_STORAGE=gcs` plus a bucket name.
 */
export declare function createStorageAdapter(testManagerRoot: string): Promise<StorageAdapter>;
