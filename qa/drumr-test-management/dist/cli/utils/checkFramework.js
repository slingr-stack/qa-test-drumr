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
exports.getBackendPath = getBackendPath;
exports.hasDrumrFramework = hasDrumrFramework;
exports.getFrameworkPath = getFrameworkPath;
const path = __importStar(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
function getBackendPath(cwd = process.cwd()) {
    return path.join(cwd, 'backend');
}
async function pathExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function hasDrumrFramework(cwd = process.cwd()) {
    const backendPath = getBackendPath(cwd);
    const packageJsonPath = path.join(backendPath, 'package.json');
    if (!(await pathExists(packageJsonPath))) {
        return false;
    }
    const content = await promises_1.default.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    return !!deps['@drumr/framework-backend'] || !!devDeps['@drumr/framework-backend'];
}
async function getFrameworkPath(cwd = process.cwd()) {
    const backendPath = getBackendPath(cwd);
    const candidates = [
        path.join(backendPath, 'node_modules', '@drumr', 'framework-backend'),
        path.join(cwd, 'node_modules', '@drumr', 'framework-backend'),
    ];
    for (const frameworkPath of candidates) {
        if (!(await pathExists(frameworkPath))) {
            continue;
        }
        const stats = await promises_1.default.lstat(frameworkPath);
        if (stats.isSymbolicLink()) {
            return await promises_1.default.realpath(frameworkPath);
        }
        return frameworkPath;
    }
    return null;
}
//# sourceMappingURL=checkFramework.js.map