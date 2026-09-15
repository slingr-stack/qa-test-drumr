"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageAdapter = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
/**
 * Stores Test Manager state as files under the application root.
 *
 * This is the default adapter and preserves the historical on-disk layout
 * (`testsManagement/test-plans.json`, `logs/test-manager/...`), so existing
 * projects keep working without any migration.
 */
class LocalStorageAdapter {
    rootDir;
    kind = 'local';
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    resolve(key) {
        const segments = key.split('/').filter(Boolean);
        return node_path_1.default.join(this.rootDir, ...segments);
    }
    async readText(key) {
        try {
            return await promises_1.default.readFile(this.resolve(key), 'utf-8');
        }
        catch {
            return null;
        }
    }
    async writeText(key, content) {
        const filePath = this.resolve(key);
        await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
        await promises_1.default.writeFile(filePath, content, 'utf-8');
    }
    async appendText(key, content) {
        const filePath = this.resolve(key);
        await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
        await promises_1.default.appendFile(filePath, content, 'utf-8');
    }
    async deleteKey(key) {
        await promises_1.default.rm(this.resolve(key), { recursive: true, force: true });
    }
    async exists(key) {
        try {
            await promises_1.default.access(this.resolve(key));
            return true;
        }
        catch {
            return false;
        }
    }
    async list(prefix) {
        const base = this.resolve(prefix);
        const keys = [];
        const walk = async (dir, relative) => {
            let entries;
            try {
                entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    await walk(node_path_1.default.join(dir, entry.name), nextRelative);
                }
                else {
                    keys.push(nextRelative);
                }
            }
        };
        await walk(base, '');
        return keys.map(key => (prefix ? `${prefix}/${key}` : key));
    }
    async close() {
        // Nothing to flush: every write is committed to disk immediately.
    }
}
exports.LocalStorageAdapter = LocalStorageAdapter;
//# sourceMappingURL=localStorageAdapter.js.map