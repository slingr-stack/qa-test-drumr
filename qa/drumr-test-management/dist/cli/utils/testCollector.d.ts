export interface CollectedTest {
    describeName: string;
    testName: string;
    fullName: string;
    specFile: string;
    type: 'unit' | 'int' | 'e2e';
    displayName: string;
}
export declare function classifySpecFile(relPath: string): 'unit' | 'int' | 'e2e';
export declare function collectTestsFromApp(appRoot: string): Promise<CollectedTest[]>;
