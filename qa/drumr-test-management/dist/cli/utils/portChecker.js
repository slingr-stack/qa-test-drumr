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
exports.isDockerRunning = isDockerRunning;
exports.isPortUsedByProjectDocker = isPortUsedByProjectDocker;
exports.isPortInUse = isPortInUse;
exports.getProcessUsingPort = getProcessUsingPort;
exports.findAvailablePort = findAvailablePort;
exports.checkPortsUsage = checkPortsUsage;
const node_child_process_1 = require("node:child_process");
const net = __importStar(require("node:net"));
const path = __importStar(require("node:path"));
function isDockerRunning() {
    try {
        (0, node_child_process_1.execSync)('docker info', { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
function isPortUsedByProjectDocker(port) {
    try {
        const projectName = path.basename(process.cwd()).toLowerCase();
        try {
            const composeContainers = (0, node_child_process_1.execSync)(`docker ps --filter "label=com.docker.compose.project=${projectName}" --format "{{.Names}}\t{{.Ports}}\t{{.ID}}"`, {
                encoding: 'utf-8',
                stdio: 'pipe',
            }).trim();
            if (composeContainers) {
                const lines = composeContainers.split('\n').filter(line => {
                    const parts = line.split('\t');
                    if (parts.length >= 2) {
                        const ports = parts[1];
                        return ports.includes(`:${port}->`) || ports.includes(`0.0.0.0:${port}->`) || ports.includes(`*:${port}->`);
                    }
                    return false;
                });
                if (lines.length > 0) {
                    const [containerName, , containerId] = lines[0].split('\t');
                    return {
                        containerId,
                        containerName,
                        isDocker: true,
                    };
                }
            }
        }
        catch {
            // Continue with fallback approach
        }
        const dockerPs = (0, node_child_process_1.execSync)(`docker ps --format "{{.Names}}\t{{.Ports}}\t{{.ID}}"`, {
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        const lines = dockerPs
            .trim()
            .split('\n')
            .filter(line => {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const ports = parts[1];
                return ports.includes(`:${port}->`) || ports.includes(`0.0.0.0:${port}->`) || ports.includes(`*:${port}->`);
            }
            return false;
        });
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 2) {
                continue;
            }
            const [containerName, , containerId] = parts;
            const isProjectContainer = containerName.toLowerCase().includes(projectName.toLowerCase()) &&
                (containerName.startsWith(`${projectName}_`) ||
                    containerName.startsWith(`${projectName}-`) ||
                    containerName.startsWith(`${projectName}`) ||
                    (containerName.includes('-db') && containerName.includes(projectName)) ||
                    (containerName.includes('_db') && containerName.includes(projectName)));
            if (isProjectContainer) {
                return {
                    containerId,
                    containerName,
                    isDocker: true,
                };
            }
        }
        return { isDocker: false };
    }
    catch {
        return { isDocker: false };
    }
}
async function isPortInUse(port, host = 'localhost') {
    const isWindows = process.platform === 'win32';
    try {
        if (isWindows) {
            const netstatResult = (0, node_child_process_1.execSync)(`netstat -an | findstr :${port}`, {
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            return netstatResult.trim().length > 0;
        }
        else {
            const lsofResult = (0, node_child_process_1.execSync)(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' });
            return lsofResult.trim().length > 0;
        }
    }
    catch {
        try {
            if (!isWindows) {
                const netstatResult = (0, node_child_process_1.execSync)(`netstat -tulpn 2>/dev/null | grep :${port}`, {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                });
                return netstatResult.trim().length > 0;
            }
        }
        catch {
            // Continue to final fallback
        }
        return new Promise(resolve => {
            const server = net.createServer();
            server.listen(port, host, () => {
                server.once('close', () => {
                    resolve(false);
                });
                server.close();
            });
            server.on('error', () => {
                resolve(true);
            });
        });
    }
}
function getProcessUsingPort(port) {
    const isWindows = process.platform === 'win32';
    try {
        if (isWindows) {
            const result = (0, node_child_process_1.execSync)(`netstat -ano | findstr :${port}`, {
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            if (result.trim()) {
                const lines = result.trim().split('\n');
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 5) {
                        const pid = parts[parts.length - 1];
                        try {
                            const processInfo = (0, node_child_process_1.execSync)(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
                                encoding: 'utf-8',
                                stdio: 'pipe',
                            });
                            if (processInfo.trim()) {
                                const processName = processInfo.split(',')[0].replace(/"/g, '');
                                return `${processName} (PID: ${pid})`;
                            }
                        }
                        catch {
                            return `Process ID: ${pid}`;
                        }
                    }
                }
            }
        }
        else {
            const result = (0, node_child_process_1.execSync)(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' });
            const pid = result.trim();
            if (pid) {
                try {
                    const processInfo = (0, node_child_process_1.execSync)(`ps -p ${pid} -o pid,comm,args --no-headers`, {
                        encoding: 'utf-8',
                        stdio: 'pipe',
                    });
                    return processInfo.trim();
                }
                catch {
                    return `Process ID: ${pid}`;
                }
            }
        }
    }
    catch {
        try {
            if (!isWindows) {
                const result = (0, node_child_process_1.execSync)(`netstat -tulpn 2>/dev/null | grep :${port}`, {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                });
                return result.trim();
            }
        }
        catch {
            // If all approaches fail, we can't determine what's using the port
        }
    }
    return null;
}
async function findAvailablePort(startingPort, maxAttempts = 10) {
    for (let port = startingPort; port < startingPort + maxAttempts; port++) {
        if (!(await isPortInUse(port))) {
            return port;
        }
    }
    return null;
}
async function checkPortsUsage(ports) {
    const results = [];
    for (const port of ports) {
        const inUse = await isPortInUse(port);
        const dockerInfo = isPortUsedByProjectDocker(port);
        const result = {
            inUse,
            isProjectDocker: dockerInfo.isDocker,
            port,
        };
        if (dockerInfo.containerId) {
            result.containerId = dockerInfo.containerId;
        }
        if (dockerInfo.containerName) {
            result.containerName = dockerInfo.containerName;
        }
        if (inUse && !dockerInfo.isDocker) {
            const process = getProcessUsingPort(port);
            if (process) {
                result.process = process;
            }
        }
        results.push(result);
    }
    return results;
}
//# sourceMappingURL=portChecker.js.map