"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GcsStorageAdapter = void 0;
/**
 * Converts low-level Google auth errors into actionable guidance. These surface
 * the first time a request is made, not when the client is constructed, so every
 * I/O method routes failures through here.
 */
function translateGcsError(error, bucketName, key) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error?.code;
    if (/could not load the default credentials/i.test(message)) {
        return new Error('Cloud Storage is enabled but no Google credentials were found.\n' +
            'For local use run:  gcloud auth application-default login\n' +
            'For CI set the GOOGLE_APPLICATION_CREDENTIALS environment variable to a service account key.\n' +
            `While accessing: ${bucketName}/${key}`);
    }
    if (code === 403) {
        return new Error(`Access denied to Cloud Storage object \"${key}\" in bucket \"${bucketName}\".\n` +
            'The active identity needs roles/storage.objectAdmin on that bucket.');
    }
    if (code === 404) {
        return new Error(`Cloud Storage bucket \"${bucketName}\" was not found (or is not visible to the active identity).\n` +
            'Check DRUMR_TEST_MANAGER_GCS_BUCKET and the bucket region/project.');
    }
    return error instanceof Error ? error : new Error(message);
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
class GcsStorageAdapter {
    bucket;
    bucketName;
    prefix;
    flushIntervalMs;
    kind = 'gcs';
    pending = new Map();
    flushTimer = null;
    lastFlushError = null;
    closed = false;
    constructor(bucket, bucketName, prefix, flushIntervalMs) {
        this.bucket = bucket;
        this.bucketName = bucketName;
        this.prefix = prefix;
        this.flushIntervalMs = flushIntervalMs;
    }
    static async create(options) {
        const { bucketName, prefix = '', flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS } = options;
        let storage;
        try {
            const moduleName = '@google-cloud/storage';
            const loaded = (await Promise.resolve(`${moduleName}`).then(s => __importStar(require(s))));
            storage = new loaded.Storage();
        }
        catch (error) {
            throw new Error('Cloud Storage storage is enabled but the "@google-cloud/storage" package is not installed.\n' +
                'Install it in your application with: pnpm add @google-cloud/storage\n' +
                `Original error: ${error instanceof Error ? error.message : String(error)}`);
        }
        const bucket = storage.bucket(bucketName);
        return new GcsStorageAdapter(bucket, bucketName, normalizePrefix(prefix), flushIntervalMs);
    }
    objectName(key) {
        const cleanKey = key.split('/').filter(Boolean).join('/');
        return this.prefix ? `${this.prefix}/${cleanKey}` : cleanKey;
    }
    async readText(key) {
        const buffered = this.pending.get(key);
        if (buffered !== undefined) {
            return buffered;
        }
        const file = this.bucket.file(this.objectName(key));
        try {
            const [content] = await file.download();
            return content.toString('utf-8');
        }
        catch (error) {
            if (isNotFound(error)) {
                return null;
            }
            throw translateGcsError(error, this.bucketName, key);
        }
    }
    async writeText(key, content) {
        // A full write supersedes any buffered append for the same key.
        this.pending.delete(key);
        try {
            await this.bucket.file(this.objectName(key)).save(content);
        }
        catch (error) {
            throw translateGcsError(error, this.bucketName, key);
        }
    }
    async appendText(key, content) {
        if (!this.pending.has(key)) {
            const existing = await this.readText(key);
            this.pending.set(key, existing ?? '');
        }
        this.pending.set(key, `${this.pending.get(key) ?? ''}${content}`);
        this.scheduleFlush();
    }
    async deleteKey(key) {
        this.pending.delete(key);
        try {
            await this.bucket.file(this.objectName(key)).delete({ ignoreNotFound: true });
        }
        catch (error) {
            throw translateGcsError(error, this.bucketName, key);
        }
    }
    async exists(key) {
        if (this.pending.has(key)) {
            return true;
        }
        try {
            const [found] = await this.bucket.file(this.objectName(key)).exists();
            return found;
        }
        catch (error) {
            throw translateGcsError(error, this.bucketName, key);
        }
    }
    async list(prefix) {
        const objectPrefix = this.objectName(prefix);
        try {
            const [files] = await this.bucket.getFiles({ prefix: objectPrefix });
            return files
                .map(file => stripPrefix(file.name, this.prefix))
                .filter(name => name.length > 0);
        }
        catch (error) {
            throw translateGcsError(error, this.bucketName, prefix);
        }
    }
    async close() {
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
    scheduleFlush() {
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
    async flush() {
        if (this.lastFlushError) {
            throw this.lastFlushError;
        }
        const entries = [...this.pending.entries()];
        for (const [key, content] of entries) {
            try {
                await this.bucket.file(this.objectName(key)).save(content);
            }
            catch (error) {
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
exports.GcsStorageAdapter = GcsStorageAdapter;
function normalizePrefix(prefix) {
    return prefix.replace(/^\/+|\/+$/g, '');
}
function stripPrefix(objectName, prefix) {
    if (!prefix) {
        return objectName;
    }
    return objectName.startsWith(`${prefix}/`) ? objectName.slice(prefix.length + 1) : objectName;
}
function isNotFound(error) {
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const code = error.code;
    return code === 404;
}
//# sourceMappingURL=gcsStorageAdapter.js.map