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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_MANAGER_CONFIG_FILENAME = exports.FRONTEND_TESTS_DIR_ENV = exports.BACKEND_TESTS_DIR_ENV = exports.APP_ROOT_ENV = void 0;
exports.loadTestManagerConfig = loadTestManagerConfig;
exports.resolveTestManagerPaths = resolveTestManagerPaths;
const path = __importStar(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
exports.APP_ROOT_ENV = 'DRUMR_TEST_MANAGER_APP_ROOT';
exports.BACKEND_TESTS_DIR_ENV = 'DRUMR_TEST_MANAGER_BACKEND_TESTS_DIR';
exports.FRONTEND_TESTS_DIR_ENV = 'DRUMR_TEST_MANAGER_FRONTEND_TESTS_DIR';
exports.TEST_MANAGER_CONFIG_FILENAME = 'config.json';
async function loadTestManagerConfig(testManagerRoot) {
    const configPath = path.join(testManagerRoot, exports.TEST_MANAGER_CONFIG_FILENAME);
    let content;
    try {
        content = await promises_1.default.readFile(configPath, 'utf-8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
    const config = JSON.parse(content);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error(`Invalid Test Manager configuration in ${configPath}. Expected a JSON object.`);
    }
    return config;
}
async function resolveTestManagerPaths(qaRoot = process.cwd()) {
    const resolvedQaRoot = path.resolve(qaRoot);
    const testManagerRoot = path.join(resolvedQaRoot, 'drumr-test-management');
    const config = await loadTestManagerConfig(testManagerRoot);
    const configuredAppRoot = process.env[exports.APP_ROOT_ENV] ?? config.appRoot;
    const appRoot = configuredAppRoot
        ? path.resolve(resolvedQaRoot, configuredAppRoot)
        : path.resolve(resolvedQaRoot, '..');
    // Test Manager is useful for any application layout. Test directories are
    // resolved by the collector and are allowed to be absent.
    return { appRoot, testManagerRoot, config };
}
//# sourceMappingURL=checkFramework.js.map