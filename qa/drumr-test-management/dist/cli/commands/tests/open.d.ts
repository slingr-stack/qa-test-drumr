export interface OpenTestsOptions {
    port?: number;
    noOpen?: boolean;
}
export declare function openTests(cwd?: string, options?: OpenTestsOptions): Promise<void>;
