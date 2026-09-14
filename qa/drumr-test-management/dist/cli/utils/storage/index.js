"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_PREFIX_ENV = exports.STORAGE_BUCKET_ENV = exports.STORAGE_KIND_ENV = exports.GcsStorageAdapter = exports.LocalStorageAdapter = void 0;
exports.resolveStorageKind = resolveStorageKind;
exports.createStorageAdapter = createStorageAdapter;
const node_path_1 = __importDefault(require("node:path"));
const localStorageAdapter_js_1 = require("./localStorageAdapter.js");
const gcsStorageAdapter_js_1 = require("./gcsStorageAdapter.js");
var localStorageAdapter_js_2 = require("./localStorageAdapter.js");
Object.defineProperty(exports, "LocalStorageAdapter", { enumerable: true, get: function () { return localStorageAdapter_js_2.LocalStorageAdapter; } });
var gcsStorageAdapter_js_2 = require("./gcsStorageAdapter.js");
Object.defineProperty(exports, "GcsStorageAdapter", { enumerable: true, get: function () { return gcsStorageAdapter_js_2.GcsStorageAdapter; } });
/** Selects where Test Manager state is stored. Defaults to `local`. */
exports.STORAGE_KIND_ENV = 'DRUMR_TEST_MANAGER_STORAGE';
/** Cloud Storage bucket name. Required when storage kind is `gcs`. */
exports.STORAGE_BUCKET_ENV = 'DRUMR_TEST_MANAGER_GCS_BUCKET';
/** Optional object-name prefix inside the bucket. Defaults to the app directory name. */
exports.STORAGE_PREFIX_ENV = 'DRUMR_TEST_MANAGER_GCS_PREFIX';
function resolveStorageKind() {
    const raw = (process.env[exports.STORAGE_KIND_ENV] ?? 'local').trim().toLowerCase();
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
async function createStorageAdapter(appRoot) {
    const kind = resolveStorageKind();
    if (kind === 'local') {
        return new localStorageAdapter_js_1.LocalStorageAdapter(appRoot);
    }
    const bucketName = (process.env[exports.STORAGE_BUCKET_ENV] ?? '').trim();
    if (!bucketName) {
        throw new Error(`Cloud Storage is enabled but ${exports.STORAGE_BUCKET_ENV} is not set.\n` +
            'Set it to the bucket that will hold Test Manager state, for example:\n' +
            `  export ${exports.STORAGE_BUCKET_ENV}=my-drumr-test-manager-bucket`);
    }
    const configuredPrefix = (process.env[exports.STORAGE_PREFIX_ENV] ?? '').trim();
    const prefix = configuredPrefix || node_path_1.default.basename(appRoot);
    return gcsStorageAdapter_js_1.GcsStorageAdapter.create({ bucketName, prefix });
}
//# sourceMappingURL=index.js.map