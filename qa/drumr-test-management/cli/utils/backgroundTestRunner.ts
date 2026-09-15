import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import { readJestCaseStatus, readPlaywrightCaseStatus } from './testResultParser';
import {
  getRunLogKey,
  updateRunCase,
  updateRunLifecycle,
  type TestExecutionStatus,
} from './testRunState';
import { createStorageAdapter, type StorageAdapter } from './storage/index.js';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serializes log appends so chunks never interleave, and isolates failures:
 * losing a log line must never abort a running test execution.
 */
function createLogWriter(storage: StorageAdapter, logKey: string): (text: string) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();

  return (text: string) => {
    chain = chain
      .then(() => storage.appendText(logKey, text))
      .catch(() => undefined);
    return chain;
  };
}

interface BackgroundTestCommand {
  label: string;
  caseId?: string;
  specFile?: string;
  testName?: string;
  fullName?: string;
  cwd: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  resultFilePath: string;
  parser: 'jest' | 'playwright';
}

interface BackgroundRunnerPayload {
  appRoot: string;
  testManagerRoot: string;
  runId: string;
  label: string;
  logFilePath: string;
  logFileRelativePath: string;
  commands: BackgroundTestCommand[];
}

function buildCaseMatcher(command: BackgroundTestCommand): { caseId?: string; specFile?: string; testName?: string; fullName?: string } {
  return Object.fromEntries(
    Object.entries({
      caseId: command.caseId,
      specFile: command.specFile,
      testName: command.testName,
      fullName: command.fullName,
    }).filter(([, value]) => value !== undefined),
  );
}

function buildCasePatch(patch: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

function buildResultMatcher(command: BackgroundTestCommand) {
  return Object.fromEntries(
    Object.entries({
      fullName: command.fullName,
      testName: command.testName,
    }).filter(([, value]) => value !== undefined),
  );
}

function formatCommand(command: BackgroundTestCommand): string {
  return [command.executable, ...command.args].join(' ');
}

async function executeCommand(
  storage: StorageAdapter,
  payload: BackgroundRunnerPayload,
  command: BackgroundTestCommand,
  writeLog: (text: string) => Promise<void>,
): Promise<{ exitCode: number; status: TestExecutionStatus }> {
  const startedAt = new Date().toISOString();
  await updateRunCase(
    storage,
    payload.runId,
    buildCaseMatcher(command),
    buildCasePatch({ startedAt }),
  );

  await writeLog(`\n[case] ${command.label}\n`);
  await writeLog(`[cwd] ${command.cwd}\n`);
  await writeLog(`$ ${formatCommand(command)}\n`);
  await fsp.rm(command.resultFilePath, { recursive: true, force: true });

  return new Promise(resolve => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: { ...process.env, ...(command.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', chunk => void writeLog(String(chunk)));
    child.stderr?.on('data', chunk => void writeLog(String(chunk)));

    child.once('error', async error => {
      await writeLog(`\n[error] ${error.message}\n`);
      await updateRunCase(
        storage,
        payload.runId,
        buildCaseMatcher(command),
        {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: error.message,
        },
      );
      resolve({ exitCode: 1, status: 'failed' });
    });

    child.once('close', async code => {
      const exitCode = code ?? 1;
      await writeLog(`\n[exit] ${exitCode}\n`);

      let status: TestExecutionStatus | null = null;
      if (command.parser === 'jest') {
        status = await readJestCaseStatus(command.resultFilePath, buildResultMatcher(command));
      } else {
        status = await readPlaywrightCaseStatus(command.resultFilePath, buildResultMatcher(command));
      }

      const finalStatus = status ?? (exitCode === 0 ? 'passed' : 'failed');
      await updateRunCase(
        storage,
        payload.runId,
        buildCaseMatcher(command),
        buildCasePatch({
          status: finalStatus,
          finishedAt: new Date().toISOString(),
          error: exitCode === 0 ? undefined : `Command exited with code ${exitCode}`,
        }),
      );
      resolve({ exitCode, status: finalStatus });
    });
  });
}

async function run(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error('Missing background test runner payload path.');
  }

  const payloadContent = await fsp.readFile(payloadPath, 'utf-8');
  const payload = JSON.parse(payloadContent) as BackgroundRunnerPayload;

  const storage = await createStorageAdapter(payload.testManagerRoot);
  const writeLog = createLogWriter(storage, getRunLogKey(payload.runId));

  let exitCode = 0;
  await updateRunLifecycle(storage, payload.runId, 'running', { startedAt: new Date().toISOString() });
  await writeLog(`[run] ${payload.label}\n`);
  await writeLog(`[id] ${payload.runId}\n`);
  await writeLog(`[startedAt] ${new Date().toISOString()}\n`);

  try {
    for (const command of payload.commands) {
      const commandResult = await executeCommand(storage, payload, command, writeLog);
      if (commandResult.exitCode !== 0) {
        exitCode = commandResult.exitCode;
      }
    }

    await writeLog(`\n[finishedAt] ${new Date().toISOString()}\n`);
    await writeLog(`[result] ${exitCode === 0 ? 'success' : 'failed'}\n`);
    await updateRunLifecycle(
      storage,
      payload.runId,
      exitCode === 0 ? 'completed' : 'failed',
      { finishedAt: new Date().toISOString() },
    );
  } finally {
    // Await the pending chain so buffered log writes flush before exit.
    await writeLog('');
    await storage.close();
    await fsp.rm(payloadPath, { recursive: true, force: true });
  }

  process.exit(exitCode);
}

void run().catch(async error => {
  const payloadPath = process.argv[2];
  if (payloadPath && (await pathExists(payloadPath))) {
    const payloadContent = await fsp.readFile(payloadPath, 'utf-8');
    const payload = JSON.parse(payloadContent) as BackgroundRunnerPayload;
    const storage = await createStorageAdapter(payload.testManagerRoot);
    const writeLog = createLogWriter(storage, getRunLogKey(payload.runId));

    await writeLog(`[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    await updateRunLifecycle(storage, payload.runId, 'failed', {
      finishedAt: new Date().toISOString(),
    });
    await storage.close();
    await fsp.rm(payloadPath, { recursive: true, force: true });
  }

  process.exit(1);
});
