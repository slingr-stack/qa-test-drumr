import type { StorageAdapter } from './storageAdapter.js';

/**
 * Minimal surface of `@google-cloud/storage` used by the adapter.
 * Declared locally so the package does not need the library at build time and
 * can load it lazily at runtime when Cloud Storage is actually enabled.
 */
interface GcsFile {
  exists(): Promise<[boolean]>;
  download(): Promise<[Buffer]>;
  save(data: string): Promise<void>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
}

interface GcsBucket {
  file(name: string): GcsFile;
  getFiles(options: { prefix: string }): Promise<[Array<{ name: string }>]>;
}

interface GcsStorage {
  bucket(name: string): GcsBucket;
}

/**
 * Converts low-level Google auth errors into actionable guidance. These surface
 * the first time a request is made, not when the client is constructed, so every
 * I/O method routes failures through here.
 */
function translateGcsError(error: unknown, bucketName: string, key: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: number | string } | null)?.code;

  if (/could not load the default credentials/i.test(message)) {
    return new Error(
      'Cloud Storage is enabled but no Google credentials were found.\n' +
        'For local use run:  gcloud auth application-default login\n' +
        'For CI set the GOOGLE_APPLICATION_CREDENTIALS environment variable to a service account key.\n' +
        `While accessing: ${bucketName}/${key}`,
    );
  }

  if (code === 403) {
    return new Error(
      `Access denied to Cloud Storage object \"${key}\" in bucket \"${bucketName}\".\n` +
        'The active identity needs roles/storage.objectAdmin on that bucket.',
    );
  }

  if (code === 404) {
    return new Error(
      `Cloud Storage bucket \"${bucketName}\" was not found (or is not visible to the active identity).\n` +
        'Check DRUMR_TEST_MANAGER_GCS_BUCKET and the bucket region/project.',
    );
  }

  return error instanceof Error ? error : new Error(message);
}

export interface GcsStorageAdapterOptions {
  bucketName: string;
  /** Object-name prefix, e.g. `my-app`. Keeps several apps in one bucket. */
  prefix?: string;
  /** Flush interval for buffered appends, in milliseconds. */
  flushIntervalMs?: number;
}

const DEFAULT_FLUSH_INTERVAL_MS = 2000;

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
export class GcsStorageAdapter implements StorageAdapter {
  public readonly kind = 'gcs' as const;

  private readonly pending = new Map<string, string>();
  private flushTimer: NodeJS.Timeout | null = null;
  private lastFlushError: Error | null = null;
  private closed = false;

  private constructor(
    private readonly bucket: GcsBucket,
    private readonly bucketName: string,
    private readonly prefix: string,
    private readonly flushIntervalMs: number,
  ) {}

  public static async create(options: GcsStorageAdapterOptions): Promise<GcsStorageAdapter> {
    const { bucketName, prefix = '', flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS } = options;

    let storage: GcsStorage;
    try {
      const moduleName = '@google-cloud/storage';
      const loaded = (await import(moduleName)) as unknown as { Storage: new () => GcsStorage };
      storage = new loaded.Storage();
    } catch (error) {
      throw new Error(
        'Cloud Storage storage is enabled but the "@google-cloud/storage" package is not installed.\n' +
          'Install it in your application with: pnpm add @google-cloud/storage\n' +
          `Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const bucket = storage.bucket(bucketName);
    return new GcsStorageAdapter(bucket, bucketName, normalizePrefix(prefix), flushIntervalMs);
  }

  private objectName(key: string): string {
    const cleanKey = key.split('/').filter(Boolean).join('/');
    return this.prefix ? `${this.prefix}/${cleanKey}` : cleanKey;
  }

  public async readText(key: string): Promise<string | null> {
    const buffered = this.pending.get(key);
    if (buffered !== undefined) {
      return buffered;
    }

    const file = this.bucket.file(this.objectName(key));
    try {
      const [content] = await file.download();
      return content.toString('utf-8');
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw translateGcsError(error, this.bucketName, key);
    }
  }

  public async writeText(key: string, content: string): Promise<void> {
    // A full write supersedes any buffered append for the same key.
    this.pending.delete(key);
    try {
      await this.bucket.file(this.objectName(key)).save(content);
    } catch (error) {
      throw translateGcsError(error, this.bucketName, key);
    }
  }

  public async appendText(key: string, content: string): Promise<void> {
    if (!this.pending.has(key)) {
      const existing = await this.readText(key);
      this.pending.set(key, existing ?? '');
    }

    this.pending.set(key, `${this.pending.get(key) ?? ''}${content}`);
    this.scheduleFlush();
  }

  public async deleteKey(key: string): Promise<void> {
    this.pending.delete(key);
    try {
      await this.bucket.file(this.objectName(key)).delete({ ignoreNotFound: true });
    } catch (error) {
      throw translateGcsError(error, this.bucketName, key);
    }
  }

  public async exists(key: string): Promise<boolean> {
    if (this.pending.has(key)) {
      return true;
    }
    try {
      const [found] = await this.bucket.file(this.objectName(key)).exists();
      return found;
    } catch (error) {
      throw translateGcsError(error, this.bucketName, key);
    }
  }

  public async list(prefix: string): Promise<string[]> {
    const objectPrefix = this.objectName(prefix);
    try {
      const [files] = await this.bucket.getFiles({ prefix: objectPrefix });
      return files
        .map(file => stripPrefix(file.name, this.prefix))
        .filter(name => name.length > 0);
    } catch (error) {
      throw translateGcsError(error, this.bucketName, prefix);
    }
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.closed) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      // A failed background flush must not crash the process: log it, and let the
      // next `close()` surface the problem to the caller.
      this.flush().catch(error => {
        this.lastFlushError = error instanceof Error ? error : new Error(String(error));
      });
    }, this.flushIntervalMs);

    // Do not hold the event loop open just for a pending flush.
    this.flushTimer.unref?.();
  }

  private async flush(): Promise<void> {
    if (this.lastFlushError) {
      throw this.lastFlushError;
    }

    const entries = [...this.pending.entries()];
    for (const [key, content] of entries) {
      try {
        await this.bucket.file(this.objectName(key)).save(content);
      } catch (error) {
        // Surface credential/permission problems once, then stop retrying so a
        // broken configuration does not turn into an endless upload loop.
        this.pending.delete(key);
        throw translateGcsError(error, this.bucketName, key);
      }

      // Only clear when nothing was appended while the upload was in flight.
      if (this.pending.get(key) === content) {
        this.pending.delete(key);
      }
    }
  }
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '');
}

function stripPrefix(objectName: string, prefix: string): string {
  if (!prefix) {
    return objectName;
  }
  return objectName.startsWith(`${prefix}/`) ? objectName.slice(prefix.length + 1) : objectName;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: number | string }).code;
  return code === 404;
}
