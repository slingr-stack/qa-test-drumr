export declare function isDockerRunning(): boolean;
export declare function isPortUsedByProjectDocker(port: number): {
    containerId?: string;
    containerName?: string;
    isDocker: boolean;
};
export declare function isPortInUse(port: number, host?: string): Promise<boolean>;
export declare function getProcessUsingPort(port: number): null | string;
export declare function findAvailablePort(startingPort: number, maxAttempts?: number): Promise<null | number>;
export declare function checkPortsUsage(ports: number[]): Promise<Array<{
    containerId?: string;
    containerName?: string;
    inUse: boolean;
    isProjectDocker?: boolean;
    port: number;
    process?: string;
}>>;
