import path from 'node:path';

import type { StorageAdapter } from './storageAdapter.js';
import { LocalStorageAdapter } from './localStorageAdapter.js';
import { GcsStorageAdapter } from './gcsStorageAdapter.js';

export type { StorageAdapter } from './storageAdapter.js';
export { LocalStorageAdapter } from './localStorageAdapter.js';
export { GcsStorageAdapter } from './gcsStorageAdapter.js';

/** Selects where Test Manager state is stored. Defaults to `local`. */
export const STORAGE_KIND_ENV = 'DRUMR_TEST_MANAGER_STORAGE';
/** Cloud Storage bucket name. Required when storage kind is `gcs`. */
export const STORAGE_BUCKET_ENV = 'DRUMR_TEST_MANAGER_GCS_BUCKET';
/** Optional object-name prefix inside the bucket. Defaults to the app directory name. */
export const STORAGE_PREFIX_ENV = 'DRUMR_TEST_MANAGER_GCS_PREFIX';

export function resolveStorageKind(): 'local' | 'gcs' {
  const raw = (process.env[STORAGE_KIND_ENV] ?? 'local').trim().toLowerCase();
  if (raw === 'gcs' || raw === 'cloud-storage') {
    return 'gcs';
  }
  return 'local';
}

/**
 * Builds the storage adapter for a Test Manager process.
 *
 * Local storage keeps every artefact on disk under the application root, so the
 * Test Manager works offline with zero configuration. Cloud Storage is opt-in
 * through `DRUMR_TEST_MANAGER_STORAGE=gcs` plus a bucket name.
 */
export async function createStorageAdapter(appRoot: string): Promise<StorageAdapter> {
  const kind = resolveStorageKind();

  if (kind === 'local') {
    return new LocalStorageAdapter(appRoot);
  }

  const bucketName = (process.env[STORAGE_BUCKET_ENV] ?? '').trim();
  if (!bucketName) {
    throw new Error(
      `Cloud Storage is enabled but ${STORAGE_BUCKET_ENV} is not set.\n` +
        'Set it to the bucket that will hold Test Manager state, for example:\n' +
        `  export ${STORAGE_BUCKET_ENV}=my-drumr-test-manager-bucket`,
    );
  }

  const configuredPrefix = (process.env[STORAGE_PREFIX_ENV] ?? '').trim();
  const prefix = configuredPrefix || path.basename(appRoot);

  return GcsStorageAdapter.create({ bucketName, prefix });
}
