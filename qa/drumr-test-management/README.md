# Drumr Test Manager Extension

This directory contains the core implementation of the **Drumr Test Manager**, a visual testing dashboard and CLI tool that parses, manages, and executes test suites (Unit, Integration, and E2E) across a Drumr application workspace.

---

## 1. Architectural & Implementation Overview

The Drumr Test Manager is structured as a CLI utility that launches an interactive companion web interface. It behaves as an orchestration engine between the developer, a web browser, and local test runners (Jest and Playwright).

### Key Components

1. **CLI Commands (`cli/commands/tests/`)**:
   - [setup.ts](cli/commands/tests/setup.ts): Scaffolds the testing structure, ensures `testsManagement/` directory is present, and generates an initial [test-plans.json](testsManagement/test-plans.json) catalog.
   - [open.ts](cli/commands/tests/open.ts): Discovers an open port, launches the local HTTP backend server, and automatically opens the user's web browser to the management UI.
   - [import.ts](cli/commands/tests/import.ts): Serves as a **physical preset importer** script to clone these commands, utilities, and UI templates directly into any target CLI app's repository.

2. **Core Utilities (`cli/utils/`)**:
   - [testCollector.ts](cli/utils/testCollector.ts): A syntax parser that scans files with matches like `*.spec.ts` or `*.test.ts`, reads `describe` and `it`/`test` blocks, classifies them by type (`unit`, `int`, `e2e`), and maps them to JSON objects.
   - [testServer.ts](cli/utils/testServer.ts): A lightweight `node:http` api server that handles reads/writes to [test-plans.json](testsManagement/test-plans.json), streams real-time test run logs, and acts as the backend for the visual UI.
   - [testRunPlanner.ts](cli/utils/testRunPlanner.ts) & [backgroundTestRunner.ts](cli/utils/backgroundTestRunner.ts): Formulates execution command payloads for individual unit/integration/e2e specs and triggers a headless detached background process to invoke Jest/Playwright. Updates test execution states on-the-fly and writes JSON outcomes.
   - [testResultParser.ts](cli/utils/testResultParser.ts): Extracts fine-grained results, errors, and stacks out of the JSON outputs emitted by local Jest/Playwright runs.
   - [checkFramework.ts](cli/utils/checkFramework.ts) & [portChecker.ts](cli/utils/portChecker.ts): Handles ecosystem verification and network listener setups.

3. **Web UI Templates (`cli/templates/test-ui/`)**:
   - [index.html](cli/templates/test-ui/index.html): A single-page, fast, responsive web application that interacts with `testServer.ts` APIs to present, create, and manage test plans verbally, visualize real-time test status, and stream live console logs.

---

## 2. Evaluation: Is the current code ready for use in other projects?

**Yes, but with specific caveats and configuration requirements.**

The current implementation is fully functional and elegantly decouples the runner from the UI. The inclusion of [import.ts](cli/commands/tests/import.ts) allows other repositories to script the extraction of this template. However, to use this successfully as a modular extension, the following constraints must be met or addressed in the target project:

### ⚠️ Dependencies & Ecosystem Assumptions

1. **Workspace Directory Structure Constraints**:
   - The tooling assumes a dual-workspace structure consisting of a `backend/` workspace (with standard Jest settings under `backend/config/jest.config.ts`) and a `frontend/` workspace.
   - [checkFramework.ts](cli/utils/checkFramework.ts) explicitly checks for the existence of `backend/package.json` and imports `@drumr/framework-backend` to confirm it is a valid Drumr application. If we wish to run Test Manager in a generic non-backend repository, this check will fail unless disabled or configured.

2. **Testing Framework Presets**:
   - **Jest (Unit/Integration)** is anticipated to run within `backend/` and `frontend/` directories via `npx jest --config config/jest.config.ts --runInBand --json --outputFile <resultFilePath> <specFile>`.
   - **Playwright (E2E)** is anticipated to be triggered from the workspace root directory via an npm script: `npm run test:e2e -- <specFile> --workers=1 --reporter=json`.
   Any project consuming this extension must match these configurations, or these paths must be customized.

3. **Zero Third-Party dependencies**:
   - **No external file-system libraries**: The extension is built purely on top of native Node.js Built-In modules (`node:fs` and `node:fs/promises`). You don't need `fs-extra`, `rimraf`, `mkdirp`, or any other directory utility in your project's `package.json` to make it work!

4. **The Non-TS Asset Bundling Problem**:
   - `open.ts` reads the web interface from `path.join(__dirname, '..', '..', 'templates', 'test-ui', 'index.html')`.
   - If the target project builds its typescript code via raw `tsc`, **`tsc` will not copy `index.html`** into the build `dist/` directory.
   - Running the built command in target projects will therefore throw a `File not found` error on runtime unless a tool (like `copyfiles`, `esbuild`, or a post-build shell script) is integrated to sync asset files into the output directory.

---

## 3. How to Implement as an Extension in Another Project

Below are the two recommended pathways to integrate and run this Test Manager in another project.

### Approach A: Physical Module Import (Using current `import.ts`)

This is the fastest path if you want to integrate the code directly into your codebase and let your local bundler/compiler manage it.

#### Step 1: Pre-requisites in Target Workspace
There are no third-party package dependencies required, as the utility leverages native Node.js APIs exclusively.

#### Step 2: Extract and Copy Files
Run the standalone `import.ts` utility from the `drumr-test-management` package, pointing `--target` to your target project folder (where `cli/src` lives):
```bash
# From within the qa directory where import.ts is located
npx tsx drumr-test-management/cli/commands/tests/import.ts --target /absolute/path/to/target-project
```
This physical script copies:
* `cli/src/commands/tests/setup.ts` & `open.ts`
* `cli/src/utils/*`
* `cli/src/templates/test-ui/index.html`

#### Step 3: Register Commands in Target CLI
In your target project's CLI parser (e.g., Commander, Yargs, or custom command router), register the new commands.

*Example (Commander.js)*:
```typescript
import { Command } from 'commander';
import { setupTests } from './commands/tests/setup.js';
import { openTests } from './commands/tests/open.js';

const program = new Command();

const testsGroup = program
  .command('tests')
  .description('Manage application test plans and runs');

testsGroup
  .command('setup')
  .description('Scaffold test infrastructure and output test-plans.json')
  .action(async () => {
    await setupTests(process.cwd());
  });

testsGroup
  .command('open')
  .description('Launch the visual interactive Test Manager UI')
  .option('-p, --port <number>', 'Port to open server on', parseInt)
  .option('--no-open', 'Start server without opening browser tab')
  .action(async (options) => {
    await openTests(process.cwd(), {
      port: options.port,
      noOpen: !options.open,
    });
  });

program.parse(process.argv);
```

#### Step 4: Asset Copy Post-Build
Ensure your build/transpile script handles the UI template asset. Add a post-build task in your target `package.json` to move the HTML file:
```json
"scripts": {
  "build": "tsc && pnpm run copy-assets",
  "copy-assets": "copyfiles -u 2 \"src/templates/**/*.html\" dist/"
}
```
*(Requires `pnpm add -D copyfiles`)*

---

### Approach B: Modern Package Import (Packaging as `@drumr/test-management`) ✅ Implemented

This is the **recommended** integration path. A single reusable source package is published once and consumed by any number of upstream projects, without copying any codebase files. The package fully bundles the UI templates, so consumers need no post-build asset handling.

#### Package structure (already implemented in this directory)

- `package.json` — package manifest with `exports` (`./open`, `./setup`) and a `bin` (`drumr-test-manager`).
- `tsconfig.build.json` — compiles `cli/**` (CommonJS) to `dist/`.
- `scripts/copy-assets.mjs` — syncs `cli/templates/test-ui/index.html` into `dist/` and sets the executable bit on the CLI bin.
- `cli/bin/test-manager.ts` — a small executable CLI (`open`, `setup`, `help`).

```json
{
  "name": "@drumr/test-management",
  "version": "1.0.0-beta.1",
  "main": "./dist/cli/commands/tests/open.js",
  "types": "./dist/cli/commands/tests/open.d.ts",
  "bin": { "drumr-test-manager": "./dist/cli/bin/test-manager.js" },
  "exports": {
    ".":   { "require": "./dist/cli/commands/tests/open.js" },
    "./open":  { "require": "./dist/cli/commands/tests/open.js" },
    "./setup": { "require": "./dist/cli/commands/tests/setup.js" }
  },
  "files": ["dist/**/*"],
  "dependencies": {},
  "devDependencies": { "typescript": "^5.0.0" },
  "scripts": {
    "build": "tsc --project tsconfig.build.json && pnpm run copy-assets",
    "copy-assets": "node scripts/copy-assets.mjs",
    "clean": "node scripts/clean.mjs"
  },
  "publishConfig": {
    "registry": "https://us-central1-npm.pkg.dev/future-name-492914-n5/drumr-npm/",
    "access": "restricted"
  }
}
```

> **Note:** The build uses native Node scripts (`node:fs/promises`) instead of `copyfiles`, keeping the **zero third-party runtime dependencies** guarantee. TypeScript is only a `devDependency`, so it is not shipped to consumers.

#### Build
```bash
cd qa/drumr-test-management
pnpm install          # installs devDependency typescript
pnpm run build        # tsc + copy assets + chmod bin
```

#### Publish / Reference
```bash
cd qa/drumr-test-management
pnpm publish          # publishes to the GCP Artifact Registry (see publishConfig)
```
Consumers install it like any package:
```bash
pnpm add @drumr/test-management
```

#### Use as a library (register in a target CLI)
```typescript
import { setupTests } from '@drumr/test-management/setup';
import { openTests } from '@drumr/test-management/open';

// e.g. with commander/yargs/oclif:
await openTests(process.cwd(), { port: 4000, noOpen: false });
```

#### Use as a standalone binary
The package ships a runnable CLI via its `bin`:
```bash
drumr-test-manager setup
drumr-test-manager open            # port 4000, opens browser
drumr-test-manager open --no-open  # start without opening browser
drumr-test-manager open --port 5000
```

No file copy or post-build custom asset movements are required from the consumer project, as the package internally resolves UI pages inside its own `node_modules/@drumr/test-management/dist/...` directory structure.
